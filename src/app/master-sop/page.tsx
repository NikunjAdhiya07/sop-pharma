'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import PageHeader from '@/components/PageHeader';
import SOPTreeView from '@/components/SOPTreeView';
import { Search, FolderTree, FileText, Download, Eye, Loader2, ArrowLeft, Grid, List, History, X, ChevronDown, ChevronRight } from 'lucide-react';

interface MasterSOP {
  _id: string;
  sopIdentifier: string;
  sopName: string;
  department: string;
  departmentCode: string;
  folderPath: string;
  parentFolder?: string;
  subfolderLevel: number;
  sopDocument: {
    fileName: string;
    filePath: string;
    fileSize: number;
    uploadedAt: string;
  };
  metadata: {
    effectiveDate?: string;
    reviewDate?: string;
    expiryDate?: string;
    version?: string;
    wordCount: number;
  };
  resources: {
    hasVideos: boolean;
    videoCount: number;
    hasSlides: boolean;
    slideCount: number;
    hasMCQs: boolean;
    mcqCount: number;
  };
  createdAt: string;
  updatedAt: string;
}

export default function MasterSOPPage() {
  useAuthGuard();
  const router = useRouter();
  
  // State
  const [sops, setSops] = useState<MasterSOP[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Tree view state
  const [viewMode, setViewMode] = useState<'table' | 'folder'>('folder');
  const [treeData, setTreeData] = useState<any>(null);
  const [loadingTree, setLoadingTree] = useState(false);
  
  // Upload history state
  const [showHistory, setShowHistory] = useState(false);
  const [uploadHistory, setUploadHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotalPages, setHistoryTotalPages] = useState(1);
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());

  // Fetch data from Master SOP Repository API
  useEffect(() => {
    fetchMasterRepository();
    if (viewMode === 'folder') {
      fetchTreeData();
    }
  }, [selectedDepartment, viewMode]);

  const fetchTreeData = async () => {
    setLoadingTree(true);
    try {
      const response = await fetch('/api/master-sop-repository/tree');
      const data = await response.json();
      
      if (data.success) {
        setTreeData(data);
        console.log('📊 SOP Tree data loaded:', data.stats);
      }
    } catch (error) {
      console.error('Error fetching tree data:', error);
    } finally {
      setLoadingTree(false);
    }
  };

  const fetchMasterRepository = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (selectedDepartment !== 'all') {
        params.append('department', selectedDepartment);
      }

      const response = await fetch(`/api/master-sop-repository?${params}`);
      const data = await response.json();

      if (data.success) {
        setSops(data.sops);
        setDepartments(data.departments);
      }
    } catch (error) {
      console.error('Error fetching Master SOP Repository:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUploadHistory = async (page = 1) => {
    try {
      setLoadingHistory(true);
      const response = await fetch(`/api/master-sop-repository/audit-logs?page=${page}&limit=10`);
      const data = await response.json();

      if (data.success) {
        setUploadHistory(data.logs);
        setHistoryTotalPages(data.pagination.totalPages);
        setHistoryPage(data.pagination.page);
      }
    } catch (error) {
      console.error('Error fetching upload history:', error);
    } finally {
      setLoadingHistory(false);
    }
  };

  const toggleLogExpansion = (logId: string) => {
    const newExpanded = new Set(expandedLogs);
    if (newExpanded.has(logId)) {
      newExpanded.delete(logId);
    } else {
      newExpanded.add(logId);
    }
    setExpandedLogs(newExpanded);
  };

  // Filter SOPs by search
  const getFilteredSOPs = () => {
    if (!searchTerm) return sops;
    
    const search = searchTerm.toLowerCase();
    return sops.filter(sop =>
      sop.sopName.toLowerCase().includes(search) ||
      sop.sopIdentifier.toLowerCase().includes(search) ||
      sop.folderPath?.toLowerCase().includes(search)
    );
  };

  const filteredSOPs = getFilteredSOPs();

  const handleViewDocument = (sop: any) => {
    router.push(`/master-sop/view/${sop._id}`);
  };

  const handleDownloadDocument = async (sop: any) => {
    try {
      const dl = new URLSearchParams();
      dl.set('path', sop.sopDocument.filePath);
      dl.set('identifier', sop.sopIdentifier);
      const response = await fetch(`/api/files/download?${dl.toString()}`);
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || response.statusText);
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = sop.sopDocument.fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error downloading document:', error);
      alert('Failed to download document');
    }
  };

  if (loading && viewMode === 'table') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-purple-950 to-slate-950 flex items-center justify-center">
        <Loader2 className="h-12 w-12 text-green-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-purple-950 to-slate-950">
      <PageHeader />
      
      <div className="max-w-[1800px] mx-auto px-6 py-8">
        {/* Header */}
        <div className="bg-gradient-to-r from-green-900/30 to-emerald-900/30 border border-green-500/30 rounded-2xl p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push('/sop-library')}
                className="p-2 hover:bg-white/10 rounded-lg transition-all"
              >
                <ArrowLeft className="h-6 w-6 text-gray-300" />
              </button>
              <FolderTree className="h-8 w-8 text-green-400" />
              <div>
                <h1 className="text-3xl font-bold text-white">Master SOP Repository</h1>
                <p className="text-gray-300">
                  All DOCX files uploaded via folder structure ({sops.length} documents)
                </p>
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Department Filter */}
            <div>
              <label className="block text-sm font-semibold text-gray-300 mb-2">
                Filter by Department
              </label>
              <select
                value={selectedDepartment}
                onChange={(e) => setSelectedDepartment(e.target.value)}
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="all" className="bg-slate-800">All Departments</option>
                {departments.map(dept => (
                  <option key={dept} value={dept} className="bg-slate-800">{dept}</option>
                ))}
              </select>
            </div>

            {/* Search */}
            <div>
              <label className="block text-sm font-semibold text-gray-300 mb-2">
                Search Documents
              </label>
              <div className="relative">
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by name, identifier, or folder..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
            </div>
          </div>
        </div>

        {/* View Mode Toggle and Upload History */}
        <div className="flex justify-between items-center mb-6">
          <button
            onClick={() => {
              setShowHistory(true);
              fetchUploadHistory(1);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white rounded-xl transition-all font-semibold shadow-lg"
          >
            <History className="h-5 w-5" />
            Upload History
          </button>
          
          <div className="bg-white/10 backdrop-blur-lg rounded-xl p-1 border border-white/20 inline-flex">
            <button
              onClick={() => setViewMode('table')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                viewMode === 'table'
                  ? 'bg-green-600 text-white'
                  : 'text-gray-300 hover:text-white'
              }`}
            >
              <Grid className="h-4 w-4" />
              Table View
            </button>
            <button
              onClick={() => setViewMode('folder')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                viewMode === 'folder'
                  ? 'bg-green-600 text-white'
                  : 'text-gray-300 hover:text-white'
              }`}
            >
              <List className="h-4 w-4" />
              Folder View
            </button>
          </div>
        </div>

        {/* Folder View */}
        {viewMode === 'folder' ? (
          loadingTree ? (
            <div className="text-center py-16">
              <Loader2 className="h-12 w-12 text-green-400 animate-spin mx-auto mb-4" />
              <p className="text-gray-400 text-xl">Loading folder structure...</p>
            </div>
          ) : treeData ? (
            <SOPTreeView
              tree={treeData.tree}
              searchTerm={searchTerm}
              onViewDocument={handleViewDocument}
              onDownloadDocument={handleDownloadDocument}
            />
          ) : (
            <div className="text-center py-16">
              <FolderTree className="h-16 w-16 text-gray-500 mx-auto mb-4" />
              <p className="text-gray-400 text-xl">No tree data available</p>
            </div>
          )
        ) : (
          <>
            {/* Documents Table */}
            <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-white/10">
                    <tr>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-300">SOP Identifier</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-300">SOP Name</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-300">Department</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-300">Folder Path</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-300">File Info</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-300">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {filteredSOPs.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center text-gray-400">
                          No documents found. Upload folders to populate the Master SOP Repository.
                        </td>
                      </tr>
                    ) : (
                      filteredSOPs.map((sop) => (
                        <tr key={sop._id} className="hover:bg-purple-900/20 transition-all duration-200 border-b border-white/5 hover:border-purple-500/30">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <FileText className="h-5 w-5 text-green-400" />
                              <span className="font-semibold text-white">{sop.sopIdentifier}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-gray-300 max-w-md truncate" title={sop.sopName}>
                              {sop.sopName}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="px-3 py-1 bg-purple-500/20 text-purple-300 rounded-lg text-sm font-semibold">
                              {sop.department}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-gray-400 text-sm max-w-xs truncate" title={sop.folderPath}>
                              📁 {sop.folderPath}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-gray-400 text-xs">
                              <div className="font-semibold text-white mb-1">{sop.sopDocument.fileName}</div>
                              <div>{(sop.sopDocument.fileSize / 1024).toFixed(1)} KB</div>
                              <div>{new Date(sop.sopDocument.uploadedAt).toLocaleDateString()}</div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleViewDocument(sop)}
                                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg hover:from-green-700 hover:to-emerald-700 transition-all text-sm font-semibold"
                              >
                                <Eye className="h-4 w-4" />
                                View
                              </button>
                              <button
                                onClick={() => handleDownloadDocument(sop)}
                                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all text-sm font-semibold"
                              >
                                <Download className="h-4 w-4" />
                                Download
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
              <div className="bg-gradient-to-br from-green-900/30 to-emerald-900/30 border border-green-500/30 rounded-xl p-6">
                <div className="flex items-center gap-3 mb-2">
                  <FileText className="h-6 w-6 text-green-400" />
                  <span className="text-gray-300 font-semibold">Total Documents</span>
                </div>
                <p className="text-3xl font-bold text-white">{sops.length}</p>
              </div>
              <div className="bg-gradient-to-br from-purple-900/30 to-pink-900/30 border border-purple-500/30 rounded-xl p-6">
                <div className="flex items-center gap-3 mb-2">
                  <FolderTree className="h-6 w-6 text-purple-400" />
                  <span className="text-gray-300 font-semibold">Departments</span>
                </div>
                <p className="text-3xl font-bold text-white">{departments.length}</p>
              </div>
              <div className="bg-gradient-to-br from-blue-900/30 to-indigo-900/30 border border-blue-500/30 rounded-xl p-6">
                <div className="flex items-center gap-3 mb-2">
                  <FileText className="h-6 w-6 text-blue-400" />
                  <span className="text-gray-300 font-semibold">Total Size</span>
                </div>
                <p className="text-3xl font-bold text-white">
                  {(sops.reduce((acc, sop) => acc + sop.sopDocument.fileSize, 0) / (1024 * 1024)).toFixed(2)} MB
                </p>
              </div>
              <div className="bg-gradient-to-br from-yellow-900/30 to-orange-900/30 border border-yellow-500/30 rounded-xl p-6">
                <div className="flex items-center gap-3 mb-2">
                  <FileText className="h-6 w-6 text-yellow-400" />
                  <span className="text-gray-300 font-semibold">Avg. Word Count</span>
                </div>
                <p className="text-3xl font-bold text-white">
                  {sops.length > 0 ? Math.round(sops.reduce((acc, sop) => acc + sop.metadata.wordCount, 0) / sops.length) : 0}
                </p>
              </div>
            </div>
          </>
        )}

        {/* Upload History Modal */}
        {showHistory && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6">
            <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl border border-green-500/30 w-full max-w-5xl max-h-[90vh] overflow-hidden shadow-2xl">
              {/* Modal Header */}
              <div className="bg-gradient-to-r from-amber-900/50 to-orange-900/50 px-6 py-4 border-b border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <History className="h-7 w-7 text-amber-400" />
                  <div>
                    <h2 className="text-2xl font-bold text-white">Upload History</h2>
                    <p className="text-sm text-gray-400">Folder upload audit logs</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowHistory(false)}
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                >
                  <X className="h-6 w-6 text-gray-400 hover:text-white" />
                </button>
              </div>

              {/* Modal Content */}
              <div className="overflow-y-auto max-h-[calc(90vh-140px)] p-6">
                {loadingHistory ? (
                  <div className="flex flex-col items-center py-20">
                    <Loader2 className="h-12 w-12 text-amber-400 animate-spin mb-4" />
                    <p className="text-gray-400">Loading upload history...</p>
                  </div>
                ) : uploadHistory.length === 0 ? (
                  <div className="text-center py-20">
                    <History className="h-16 w-16 text-gray-500 mx-auto mb-4" />
                    <p className="text-gray-400 text-xl">No upload history found</p>
                    <p className="text-gray-500 text-sm mt-2">Upload folders to see history here</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {uploadHistory.map((log) => {
                      const isExpanded = expandedLogs.has(log._id);
                      const details = log.details || {};
                      const failedFiles = details.failedFiles || [];
                      const hasFailures = failedFiles.length > 0;

                      return (
                        <div key={log._id} className="bg-white/5 border border-white/10 rounded-xl overflow-hidden hover:border-green-500/30 transition-all">
                          {/* Log Header */}
                          <div className="p-4">
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex-1">
                                <div className="flex items-center gap-3 mb-2">
                                  <span className="text-sm font-semibold text-white">
                                    {new Date(log.createdAt).toLocaleString()}
                                  </span>
                                  <span className="text-xs text-gray-500">
                                    by {log.userFullName}
                                  </span>
                                </div>
                                <div className="flex items-center gap-3">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-gray-400">Total:</span>
                                    <span className="px-2 py-1 bg-blue-500/20 text-blue-300 rounded text-xs font-bold">
                                      {details.totalFiles || 0}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-gray-400">Success:</span>
                                    <span className="px-2 py-1 bg-green-500/20 text-green-300 rounded text-xs font-bold">
                                      {details.successCount || 0}
                                    </span>
                                  </div>
                                  {hasFailures && (
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs text-gray-400">Failed:</span>
                                      <span className="px-2 py-1 bg-red-500/20 text-red-300 rounded text-xs font-bold">
                                        {details.failedCount || 0}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>
                              {hasFailures && (
                                <button
                                  onClick={() => toggleLogExpansion(log._id)}
                                  className="flex items-center gap-2 px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-lg transition-all text-xs font-semibold"
                                >
                                  {isExpanded ? (
                                    <>
                                      <ChevronDown className="h-4 w-4" />
                                      Hide Failures
                                    </>
                                  ) : (
                                    <>
                                      <ChevronRight className="h-4 w-4" />
                                      Show Failures
                                    </>
                                  )}
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Failed Files (Expandable) */}
                          {isExpanded && hasFailures && (
                            <div className="px-4 pb-4 border-t border-white/10 bg-red-900/10">
                              <div className="mt-4 space-y-2">
                                <h4 className="text-sm font-semibold text-red-300 mb-3">Failed Files:</h4>
                                {failedFiles.map((file: any, index: number) => (
                                  <div key={index} className="bg-red-900/20 border border-red-500/30 rounded-lg p-3">
                                    <p className="text-xs font-mono text-white mb-1 break-all">
                                      {file.filePath}
                                    </p>
                                    <p className="text-xs text-red-300">
                                      {file.reason}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Pagination */}
              {!loadingHistory && uploadHistory.length > 0 && historyTotalPages > 1 && (
                <div className="border-t border-white/10 px-6 py-4 flex items-center justify-between bg-white/5">
                  <button
                    onClick={() => fetchUploadHistory(historyPage - 1)}
                    disabled={historyPage === 1}
                    className="px-4 py-2 bg-white/10 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-all text-sm font-semibold"
                  >
                    Previous
                  </button>
                  <span className="text-sm text-gray-400">
                    Page {historyPage} of {historyTotalPages}
                  </span>
                  <button
                    onClick={() => fetchUploadHistory(historyPage + 1)}
                    disabled={historyPage === historyTotalPages}
                    className="px-4 py-2 bg-white/10 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-all text-sm font-semibold"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
