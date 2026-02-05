'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import PageHeader from '@/components/PageHeader';
import { 
  Upload, 
  Calendar, 
  CheckCircle2, 
  AlertTriangle, 
  Loader2, 
  FolderOpen,
  RefreshCw,
  Eye,
  Download,
  FileText,
  Clock,
  ArrowRight,
  Database,
  Zap,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  XCircle,
  ArrowLeft
} from 'lucide-react';

interface UploadProgress {
  total: number;
  completed: number;
  failed: number;
  current: string;
  errors: Array<{ fileName: string; error: string }>;
  results: Array<{
    fileName: string;
    sopId?: string;
    sopIdentifier?: string;
    extracted?: {
      effectiveDate?: string;
      reviewDate?: string;
      expiryDate?: string;
      version?: string;
    };
    sopsUpdated?: number; // For department files upload
    department?: string; // For department files upload
  }>;
}

interface SyncedSOP {
  _id: string;
  sopIdentifier: string;
  sopName: string;
  department: string;
  effectiveDate?: string;
  reviewDate?: string;
  expiryDate?: string;
  version?: string;
  syncedAt: string;
  status: 'synced' | 'pending' | 'error';
}

export default function SOPDateSyncPage() {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [syncedSOPs, setSyncedSOPs] = useState<SyncedSOP[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);
  const [uploadMode, setUploadMode] = useState<'folder' | 'files'>('files'); // Default to files mode
  const [sortField, setSortField] = useState<'sopIdentifier' | 'sopName' | 'department' | 'effectiveDate' | 'reviewDate'>('sopIdentifier');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    fetchSyncedSOPs();
  }, []);

  const fetchSyncedSOPs = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/sop-date-sync');
      const data = await response.json();
      
      if (data.success) {
        setSyncedSOPs(data.sops);
      }
    } catch (error) {
      console.error('Error fetching synced SOPs:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFolderUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setSelectedFiles(files);
    setUploading(true);
    setProgress({
      total: files.length,
      completed: 0,
      failed: 0,
      current: '',
      errors: [],
      results: []
    });

    try {
      const formData = new FormData();
      
      // Add all DOCX files
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.name.endsWith('.docx') || file.name.endsWith('.DOCX')) {
          formData.append('files', file);
        }
      }

      const response = await fetch('/api/sop-date-sync/upload-sop-files', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (data.success) {
        alert(`✅ Successfully updated ${data.updated} SOPs!\n\nSkipped: ${data.skipped}\nErrors: ${data.errors}`);
        await fetchSyncedSOPs();
      } else {
        alert(`❌ Upload failed: ${data.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Upload error:', error);
      alert('❌ Upload failed. Please check the console for details.');
    } finally {
      setUploading(false);
      setSelectedFiles(null);
      // Reset file input
      e.target.value = '';
    }
  };

  const handleDepartmentFilesUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setSelectedFiles(files);
    setUploading(true);
    setProgress({
      total: files.length,
      completed: 0,
      failed: 0,
      current: '',
      errors: [],
      results: [],
    });

    try {
      const formData = new FormData();

      // Add all DOCX files
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.name.toLowerCase().endsWith('.docx')) {
          formData.append('files', file);
        }
      }

      // Use the new department files upload endpoint
      const response = await fetch('/api/sop-date-sync/upload-department-files', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Upload failed');
      }

      // Handle streaming response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = JSON.parse(line.substring(6));
              setProgress(data);
            }
          }
        }
      }

      // Refresh the synced SOPs list
      await fetchSyncedSOPs();
      
      alert('Upload completed! Dates have been extracted and synced with SOP Monitoring.');
    } catch (error) {
      console.error('Upload error:', error);
      alert(`Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setUploading(false);
      setSelectedFiles(null);
    }
  };

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      // Toggle direction if same field
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // New field, default to ascending
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const getSortIcon = (field: typeof sortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="h-4 w-4 opacity-0 group-hover:opacity-50 transition-opacity" />;
    }
    return sortDirection === 'asc' 
      ? <ArrowUp className="h-4 w-4 text-purple-400" />
      : <ArrowDown className="h-4 w-4 text-purple-400" />;
  };

  const getSortedSOPs = () => {
    const sorted = [...syncedSOPs].sort((a, b) => {
      let aVal: any = a[sortField];
      let bVal: any = b[sortField];

      // Handle dates
      if (sortField === 'effectiveDate' || sortField === 'reviewDate') {
        aVal = aVal ? new Date(aVal).getTime() : 0;
        bVal = bVal ? new Date(bVal).getTime() : 0;
      }

      // Handle strings
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = bVal.toLowerCase();
      }

      // Compare
      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return sorted;
  };

  const handleSyncToMonitoring = async () => {
    setSyncing(true);
    try {
      const response = await fetch('/api/sop-date-sync/sync-to-monitoring', {
        method: 'POST',
      });

      const data = await response.json();

      if (data.success) {
        alert(`Successfully synced ${data.syncedCount} SOPs to monitoring!`);
        await fetchSyncedSOPs();
      } else {
        throw new Error(data.error || 'Sync failed');
      }
    } catch (error) {
      console.error('Sync error:', error);
      alert(`Sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setSyncing(false);
    }
  };

  const getStatusBadge = (sop: SyncedSOP) => {
    const hasEffectiveDate = !!sop.effectiveDate;
    const hasReviewDate = !!sop.reviewDate;

    if (hasEffectiveDate && hasReviewDate) {
      return (
        <span className="px-3 py-1 bg-green-500/20 text-green-300 rounded-full text-xs font-semibold border border-green-500/30">
          ✓ Complete
        </span>
      );
    } else if (hasEffectiveDate || hasReviewDate) {
      return (
        <span className="px-3 py-1 bg-yellow-500/20 text-yellow-300 rounded-full text-xs font-semibold border border-yellow-500/30">
          ⚠ Partial
        </span>
      );
    } else {
      return (
        <span className="px-3 py-1 bg-red-500/20 text-red-300 rounded-full text-xs font-semibold border border-red-500/30">
          ✗ Missing Dates
        </span>
      );
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-8">
      <div className="max-w-7xl mx-auto">
        <PageHeader />

        {/* Header */}
        <div className="mb-12">
          <div className="flex items-center justify-between mb-4">
            <div className="flex-1">
              <h1 className="text-5xl font-bold text-white mb-4 bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-600">
                SOP Date Sync
              </h1>
              <p className="text-gray-300 text-lg">
                Upload SOP folders to automatically extract dates and sync with SOP Monitoring
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => router.push('/sop-monitoring')}
                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all duration-300 transform hover:scale-105 active:scale-95 shadow-lg"
              >
                <Eye className="h-5 w-5" />
                View Monitoring
              </button>
            </div>
          </div>
        </div>

        {/* Upload Section */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 shadow-2xl border border-white/20 mb-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-purple-500/20 rounded-xl">
                <Upload className="h-6 w-6 text-purple-400" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white">Upload SOP Documents</h2>
                <p className="text-gray-400 text-sm">
                  {uploadMode === 'files' 
                    ? 'Select department DOCX files containing SOP dates' 
                    : 'Select folders containing SOP documents'}
                </p>
              </div>
            </div>
            
            {/* Mode Toggle */}
            <div className="flex items-center gap-2 bg-white/5 rounded-xl p-1 border border-white/10">
              <button
                onClick={() => setUploadMode('files')}
                className={`px-4 py-2 rounded-lg font-semibold transition-all ${
                  uploadMode === 'files'
                    ? 'bg-purple-600 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                📄 Department Files
              </button>
              <button
                onClick={() => setUploadMode('folder')}
                className={`px-4 py-2 rounded-lg font-semibold transition-all ${
                  uploadMode === 'folder'
                    ? 'bg-purple-600 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                📁 Folder Structure
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <div className="relative">
              {uploadMode === 'files' ? (
                <>
                  <input
                    type="file"
                    accept=".docx"
                    multiple
                    onChange={handleDepartmentFilesUpload}
                    disabled={uploading}
                    className="hidden"
                    id="files-upload"
                  />
                  <label
                    htmlFor="files-upload"
                    className={`flex flex-col items-center justify-center w-full h-64 border-2 border-dashed rounded-xl cursor-pointer transition-all ${
                      uploading
                        ? 'border-gray-600 bg-gray-800/50 cursor-not-allowed'
                        : 'border-purple-500/50 bg-purple-500/10 hover:bg-purple-500/20 hover:border-purple-400'
                    }`}
                  >
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      {uploading ? (
                        <>
                          <Loader2 className="h-16 w-16 text-purple-400 mb-4 animate-spin" />
                          <p className="text-lg font-semibold text-white mb-2">
                            Processing {progress?.completed || 0} of {progress?.total || 0} files...
                          </p>
                          {progress?.current && (
                            <p className="text-sm text-gray-400">Current: {progress.current}</p>
                          )}
                        </>
                      ) : (
                        <>
                          <FileText className="h-16 w-16 text-purple-400 mb-4" />
                          <p className="text-lg font-semibold text-white mb-2">
                            Click to select department DOCX files
                          </p>
                          <p className="text-sm text-gray-400 mb-2">
                            Each file should contain SOP dates for a department
                          </p>
                          <p className="text-xs text-gray-500">
                            e.g., 1. QA.docx, 2. QC.docx, 3. Microbiology.docx
                          </p>
                        </>
                      )}
                    </div>
                  </label>
                </>
              ) : (
                <>
                  <input
                    type="file"
                    // @ts-ignore
                    webkitdirectory=""
                    directory=""
                    multiple
                    onChange={handleFolderUpload}
                    disabled={uploading}
                    className="hidden"
                    id="folder-upload"
                  />
                  <label
                    htmlFor="folder-upload"
                    className={`flex flex-col items-center justify-center w-full h-64 border-2 border-dashed rounded-xl cursor-pointer transition-all ${
                      uploading
                        ? 'border-gray-600 bg-gray-800/50 cursor-not-allowed'
                        : 'border-purple-500/50 bg-purple-500/10 hover:bg-purple-500/20 hover:border-purple-400'
                    }`}
                  >
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      {uploading ? (
                        <>
                          <Loader2 className="h-16 w-16 text-purple-400 mb-4 animate-spin" />
                          <p className="text-lg font-semibold text-white mb-2">
                            Processing {progress?.completed || 0} of {progress?.total || 0} files...
                          </p>
                          {progress?.current && (
                            <p className="text-sm text-gray-400">Current: {progress.current}</p>
                          )}
                        </>
                      ) : (
                        <>
                          <FolderOpen className="h-16 w-16 text-purple-400 mb-4" />
                          <p className="text-lg font-semibold text-white mb-2">
                            Click to select SOP folders
                          </p>
                          <p className="text-sm text-gray-400">
                            Supports department-based folder structures with DOCX files
                          </p>
                        </>
                      )}
                    </div>
                  </label>
                </>
              )}
            </div>

            {/* Progress Details */}
            {progress && progress.total > 0 && (
              <div className="bg-white/5 rounded-xl p-6 border border-white/10">
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-green-400">{progress.completed}</div>
                    <div className="text-sm text-gray-400">Completed</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-red-400">{progress.failed}</div>
                    <div className="text-sm text-gray-400">Failed</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-purple-400">{progress.total}</div>
                    <div className="text-sm text-gray-400">Total</div>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="w-full bg-gray-700 rounded-full h-3 mb-4">
                  <div
                    className="bg-gradient-to-r from-purple-500 to-pink-500 h-3 rounded-full transition-all duration-300"
                    style={{
                      width: `${((progress.completed + progress.failed) / progress.total) * 100}%`,
                    }}
                  />
                </div>

                {/* Errors */}
                {progress.errors.length > 0 && (
                  <div className="mt-4">
                    <h3 className="text-red-400 font-semibold mb-2 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" />
                      Errors ({progress.errors.length})
                    </h3>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {progress.errors.map((err, idx) => (
                        <div key={idx} className="text-sm text-gray-400 bg-red-500/10 p-2 rounded">
                          <span className="font-mono text-xs">{err.fileName}</span>: {err.error}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Success Results */}
                {progress.results.length > 0 && (
                  <div className="mt-4">
                    <h3 className="text-green-400 font-semibold mb-2 flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4" />
                      Successfully Processed ({progress.results.length})
                    </h3>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {progress.results.slice(0, 5).map((result, idx) => (
                        <div key={idx} className="text-sm text-gray-300 bg-green-500/10 p-2 rounded">
                          <span className="font-semibold">{result.sopIdentifier || result.fileName}</span>
                          {result.extracted?.effectiveDate && (
                            <span className="ml-2 text-xs text-gray-400">
                              Effective: {new Date(result.extracted.effectiveDate).toLocaleDateString()}
                            </span>
                          )}
                          {result.extracted?.reviewDate && (
                            <span className="ml-2 text-xs text-gray-400">
                              Review: {new Date(result.extracted.reviewDate).toLocaleDateString()}
                            </span>
                          )}
                          {result.sopsUpdated !== undefined && (
                            <span className="ml-2 text-xs text-green-400">
                              ({result.sopsUpdated} SOPs updated)
                            </span>
                          )}
                        </div>
                      ))}
                      {progress.results.length > 5 && (
                        <div className="text-xs text-gray-500 text-center">
                          ... and {progress.results.length - 5} more
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Sync to Monitoring Button */}
        <div className="bg-gradient-to-r from-blue-600/20 to-purple-600/20 backdrop-blur-lg rounded-2xl p-6 shadow-2xl border border-blue-500/30 mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-500/20 rounded-xl">
                <Database className="h-6 w-6 text-blue-400" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white mb-1">Sync to SOP Monitoring</h3>
                <p className="text-gray-300 text-sm">
                  Push all extracted dates to the SOP Monitoring system for compliance tracking
                </p>
              </div>
            </div>
            <button
              onClick={handleSyncToMonitoring}
              disabled={syncing || syncedSOPs.length === 0}
              className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold rounded-xl hover:from-blue-700 hover:to-purple-700 transition-all duration-300 transform hover:scale-105 active:scale-95 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
            >
              {syncing ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Syncing...
                </>
              ) : (
                <>
                  <Zap className="h-5 w-5" />
                  Sync Now
                  <ArrowRight className="h-5 w-5" />
                </>
              )}
            </button>
          </div>
        </div>

        {/* Synced SOPs Table */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 shadow-2xl border border-white/20">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-green-500/20 rounded-xl">
                <FileText className="h-6 w-6 text-green-400" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white">Synced SOPs</h2>
                <p className="text-gray-400 text-sm">
                  {syncedSOPs.length} SOPs with extracted dates
                </p>
              </div>
            </div>
            <button
              onClick={fetchSyncedSOPs}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-all disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          {loading ? (
            <div className="text-center py-16">
              <Loader2 className="h-12 w-12 text-purple-400 animate-spin mx-auto mb-4" />
              <p className="text-gray-400">Loading synced SOPs...</p>
            </div>
          ) : syncedSOPs.length === 0 ? (
            <div className="text-center py-16">
              <Calendar className="h-16 w-16 text-gray-500 mx-auto mb-4" />
              <p className="text-gray-400 text-lg">No SOPs synced yet</p>
              <p className="text-gray-500 text-sm">Upload SOP folders to get started</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10">
                    <th 
                      className="text-left py-3 px-4 text-gray-300 font-semibold cursor-pointer hover:text-white transition-colors group"
                      onClick={() => handleSort('sopIdentifier')}
                    >
                      <div className="flex items-center gap-2">
                        SOP Code
                        {getSortIcon('sopIdentifier')}
                      </div>
                    </th>
                    <th 
                      className="text-left py-3 px-4 text-gray-300 font-semibold cursor-pointer hover:text-white transition-colors group"
                      onClick={() => handleSort('sopName')}
                    >
                      <div className="flex items-center gap-2">
                        Name
                        {getSortIcon('sopName')}
                      </div>
                    </th>
                    <th 
                      className="text-left py-3 px-4 text-gray-300 font-semibold cursor-pointer hover:text-white transition-colors group"
                      onClick={() => handleSort('department')}
                    >
                      <div className="flex items-center gap-2">
                        Department
                        {getSortIcon('department')}
                      </div>
                    </th>
                    <th 
                      className="text-left py-3 px-4 text-gray-300 font-semibold cursor-pointer hover:text-white transition-colors group"
                      onClick={() => handleSort('effectiveDate')}
                    >
                      <div className="flex items-center gap-2">
                        Effective Date
                        {getSortIcon('effectiveDate')}
                      </div>
                    </th>
                    <th 
                      className="text-left py-3 px-4 text-gray-300 font-semibold cursor-pointer hover:text-white transition-colors group"
                      onClick={() => handleSort('reviewDate')}
                    >
                      <div className="flex items-center gap-2">
                        Review Date
                        {getSortIcon('reviewDate')}
                      </div>
                    </th>
                    <th className="text-left py-3 px-4 text-gray-300 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {getSortedSOPs().map((sop) => (
                    <tr
                      key={sop._id}
                      className="border-b border-white/5 hover:bg-white/5 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <span className="font-mono text-purple-300 font-semibold">
                          {sop.sopIdentifier}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-gray-300">{sop.sopName}</td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-1 bg-blue-500/20 text-blue-300 rounded text-xs font-semibold">
                          {sop.department}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-gray-300">
                        {sop.effectiveDate ? (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {new Date(sop.effectiveDate).toLocaleDateString()}
                          </span>
                        ) : (
                          <span className="text-gray-500">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-gray-300">
                        {sop.reviewDate ? (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {new Date(sop.reviewDate).toLocaleDateString()}
                          </span>
                        ) : (
                          <span className="text-gray-500">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4">{getStatusBadge(sop)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
