'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Upload, 
  FileText, 
  AlertCircle, 
  CheckCircle2, 
  Loader2, 
  Trash2, 
  FolderOpen,
  Sparkles,
  Database,
  AlertTriangle,
  Eye,
  X,
  FileCode2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
} from 'lucide-react';

interface FileItem {
  _id: string;
  fileName: string;
  sopName: string;
  sopIdentifier: string;
  identifier: string;
  fileUrl: string;
  department: string;
  fileType: 'pdf' | 'docx';
  fileSize: number;
  uploadedAt: string;
  status: 'uploaded' | 'processing' | 'completed' | 'failed';
  mcqCount: number;
  wordCount?: number;
}

interface BulkGenerationProgress {
  total: number;
  completed: number;
  failed: number;
  current: string;
  errors: Array<{ fileName: string; error: string }>;
}

interface PreviewState {
  open: boolean;
  file: FileItem | null;
  html: string;
  loading: boolean;
  error: string;
}

export default function FilesManagerPage() {
  const router = useRouter();
  const [files, setFiles] = useState<FileItem[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [bulkGenerating, setBulkGenerating] = useState(false);
  const [progress, setProgress] = useState<BulkGenerationProgress | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);
  const [zoom, setZoom] = useState(100);
  const [preview, setPreview] = useState<PreviewState>({
    open: false,
    file: null,
    html: '',
    loading: false,
    error: '',
  });

  useEffect(() => {
    fetchFiles();
  }, []);

  // Lock body scroll when modal open
  useEffect(() => {
    if (preview.open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [preview.open]);

  const fetchFiles = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/files/list');
      const data = await response.json();
      if (response.ok) {
        setFiles(data.files || []);
      } else {
        setError(data.error || 'Failed to fetch files');
      }
    } catch (err) {
      setError('Failed to load files');
    } finally {
      setLoading(false);
    }
  };

  const handlePreview = (file: FileItem) => {
    const params = new URLSearchParams();
    if (file.fileUrl) params.set('path', file.fileUrl);
    if (file.identifier) params.set('identifier', file.identifier);

    if (file.fileType === 'docx') {
      window.open(`/dashboard/view-word?${params.toString()}`, '_blank');
    } else if (file.fileType === 'pdf') {
      window.open(`/dashboard/view-doc?${params.toString()}`, '_blank');
    }
  };

  const closePreview = () => {
    // Legacy state clear
    setPreview({ open: false, file: null, html: '', loading: false, error: '' });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFiles = Array.from(e.target.files || []);
    const validFiles = newFiles.filter(file => {
      const extension = file.name.split('.').pop()?.toLowerCase();
      return extension === 'pdf' || extension === 'docx' || extension === 'doc';
    });
    if (validFiles.length !== newFiles.length) {
      setError('Some files were skipped. Only PDF and DOC/DOCX files are allowed.');
    }
    setSelectedFiles(prev => [...prev, ...validFiles]);
    setError('');
  };

  const removeSelectedFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleBulkUpload = async () => {
    if (selectedFiles.length === 0) {
      setError('Please select at least one file');
      return;
    }
    setUploading(true);
    setError('');
    setSuccess('');
    try {
      const formData = new FormData();
      selectedFiles.forEach(file => {
        formData.append('files', file);
      });
      const response = await fetch('/api/files/bulk-upload', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Bulk upload failed');
      }
      setSuccess(`Successfully uploaded ${data.uploadedCount} file(s)`);
      setSelectedFiles([]);
      await fetchFiles();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleBulkMCQGeneration = async () => {
    if (files.length === 0) {
      setError('No files available for MCQ generation');
      return;
    }
    const confirmed = window.confirm(
      `This will generate approximately 100 MCQs from each of the ${files.length} uploaded file(s). This may take several minutes. Continue?`
    );
    if (!confirmed) return;
    setBulkGenerating(true);
    setError('');
    setSuccess('');
    setProgress({ total: files.length, completed: 0, failed: 0, current: '', errors: [] });
    try {
      const response = await fetch('/api/files/bulk-generate-mcqs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Bulk generation failed');
      }
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value);
          const lines = chunk.split('\n').filter(line => line.trim());
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const progressData = JSON.parse(line.slice(6));
                setProgress(progressData);
                if (progressData.completed + progressData.failed === progressData.total) {
                  setSuccess(
                    `Bulk generation complete! Generated MCQs from ${progressData.completed} file(s). ` +
                    `${progressData.failed > 0 ? `${progressData.failed} file(s) failed.` : ''}`
                  );
                  await fetchFiles();
                }
              } catch (e) {
                console.error('Failed to parse progress:', e);
              }
            }
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bulk generation failed');
    } finally {
      setBulkGenerating(false);
    }
  };

  const handleDeleteFile = async (fileId: string) => {
    if (!window.confirm('Are you sure you want to delete this file?')) return;
    try {
      const response = await fetch(`/api/files/delete?id=${fileId}`, { method: 'DELETE' });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Delete failed');
      }
      setSuccess('File deleted successfully');
      await fetchFiles();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-green-400 bg-green-500/20 border-green-500/30';
      case 'processing': return 'text-yellow-400 bg-yellow-500/20 border-yellow-500/30';
      case 'failed': return 'text-red-400 bg-red-500/20 border-red-500/30';
      default: return 'text-blue-400 bg-blue-500/20 border-blue-500/30';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-8">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="mb-12">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-5xl font-bold text-white mb-4 bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-600">
                📁 Files Manager
              </h1>
              <p className="text-gray-300 text-lg">
                Upload multiple SOP files, preview DOCX files, and generate MCQs in bulk
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => router.push('/mcq-bank')}
                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-semibold rounded-xl hover:from-emerald-700 hover:to-teal-700 transition-all duration-300 transform hover:scale-105 active:scale-95 shadow-lg"
              >
                <Database className="h-5 w-5" />
                MCQ Bank
              </button>
              <button
                onClick={() => router.push('/sop-upload')}
                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all duration-300 transform hover:scale-105 active:scale-95 shadow-lg"
              >
                <Upload className="h-5 w-5" />
                Single Upload
              </button>
            </div>
          </div>
        </div>

        {/* Bulk Upload Section */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 shadow-2xl border border-white/20 mb-8">
          <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
            <FolderOpen className="h-7 w-7 text-purple-400" />
            Bulk Upload Files
          </h2>
          <div className="space-y-6">
            <div>
              <input
                type="file"
                multiple
                accept=".pdf,.docx,.doc"
                onChange={handleFileSelect}
                className="hidden"
                id="bulk-file-upload"
                disabled={uploading}
              />
              <label
                htmlFor="bulk-file-upload"
                className="flex items-center justify-center w-full px-6 py-8 border-2 border-dashed border-purple-400 rounded-xl cursor-pointer hover:border-purple-300 hover:bg-white/5 transition-all duration-300"
              >
                <div className="text-center">
                  <Upload className="mx-auto h-12 w-12 text-purple-400 mb-3" />
                  <p className="text-white font-medium mb-1">
                    Click to select multiple SOP files
                  </p>
                  <p className="text-gray-400 text-sm">
                    PDF, DOC, or DOCX files • Maximum 10MB per file
                  </p>
                </div>
              </label>
            </div>

            {selectedFiles.length > 0 && (
              <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                <h3 className="text-white font-semibold mb-3">
                  Selected Files ({selectedFiles.length})
                </h3>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {selectedFiles.map((file, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between bg-white/5 rounded-lg p-3 border border-white/10"
                    >
                      <div className="flex items-center gap-3">
                        <FileText className="h-5 w-5 text-blue-400" />
                        <div>
                          <p className="text-white font-medium">{file.name}</p>
                          <p className="text-gray-400 text-sm">{formatFileSize(file.size)}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => removeSelectedFile(index)}
                        className="p-2 hover:bg-red-500/20 rounded-lg transition-colors"
                      >
                        <Trash2 className="h-4 w-4 text-red-400" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={handleBulkUpload}
              disabled={uploading || selectedFiles.length === 0}
              className="w-full py-4 px-6 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold rounded-xl hover:from-purple-700 hover:to-pink-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] shadow-lg"
            >
              {uploading ? (
                <span className="flex items-center justify-center">
                  <Loader2 className="animate-spin mr-2 h-5 w-5" />
                  Uploading {selectedFiles.length} file(s)...
                </span>
              ) : (
                `Upload ${selectedFiles.length} File(s)`
              )}
            </button>
          </div>
        </div>

        {/* Alerts */}
        {error && (
          <div className="bg-red-500/20 border border-red-500 rounded-xl p-4 mb-6 flex items-start">
            <AlertCircle className="h-5 w-5 text-red-400 mr-3 mt-0.5 flex-shrink-0" />
            <p className="text-red-200 whitespace-pre-line">{error}</p>
          </div>
        )}
        {success && (
          <div className="bg-green-500/20 border border-green-500 rounded-xl p-4 mb-6 flex items-start">
            <CheckCircle2 className="h-5 w-5 text-green-400 mr-3 mt-0.5 flex-shrink-0" />
            <p className="text-green-200">{success}</p>
          </div>
        )}

        {/* Bulk MCQ Generation Section */}
        <div className="bg-gradient-to-br from-indigo-500/20 to-purple-500/20 backdrop-blur-lg rounded-2xl p-8 shadow-2xl border border-indigo-500/30 mb-8">
          <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
            <Sparkles className="h-7 w-7 text-yellow-400" />
            Bulk MCQ Generation
          </h2>
          <p className="text-gray-300 mb-6">
            Generate approximately 100 MCQs from each uploaded file with full concurrent processing and validation.
          </p>

          {progress && (
            <div className="bg-white/10 rounded-xl p-6 mb-6 border border-white/20">
              <div className="mb-4">
                <div className="flex justify-between text-white mb-2">
                  <span>Progress: {progress.completed + progress.failed} / {progress.total}</span>
                  <span>{Math.round(((progress.completed + progress.failed) / progress.total) * 100)}%</span>
                </div>
                <div className="w-full bg-white/20 rounded-full h-3">
                  <div
                    className="bg-gradient-to-r from-green-500 to-emerald-500 h-3 rounded-full transition-all duration-500"
                    style={{ width: `${((progress.completed + progress.failed) / progress.total) * 100}%` }}
                  />
                </div>
              </div>
              {progress.current && (
                <p className="text-gray-300 text-sm">
                  Currently processing: <span className="text-white font-medium">{progress.current}</span>
                </p>
              )}
              {progress.errors.length > 0 && (
                <div className="mt-4 bg-red-500/10 rounded-lg p-4 border border-red-500/30">
                  <p className="text-red-300 font-semibold mb-2 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    Errors ({progress.errors.length})
                  </p>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {progress.errors.map((err, idx) => (
                      <p key={idx} className="text-red-200 text-sm">
                        • {err.fileName}: {err.error}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <button
            onClick={handleBulkMCQGeneration}
            disabled={bulkGenerating || files.length === 0}
            className="w-full py-4 px-6 bg-gradient-to-r from-yellow-600 to-orange-600 text-white font-bold rounded-xl hover:from-yellow-700 hover:to-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] shadow-lg"
          >
            {bulkGenerating ? (
              <span className="flex items-center justify-center">
                <Loader2 className="animate-spin mr-2 h-5 w-5" />
                Generating MCQs... ({progress?.completed || 0}/{progress?.total || 0})
              </span>
            ) : (
              `Create MCQ - Bulk (${files.length} file(s))`
            )}
          </button>
        </div>

        {/* Uploaded Files List */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 shadow-2xl border border-white/20">
          <h2 className="text-2xl font-bold text-white mb-6">Uploaded Files ({files.length})</h2>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="animate-spin h-8 w-8 text-purple-400" />
            </div>
          ) : files.length === 0 ? (
            <div className="text-center py-12">
              <FolderOpen className="mx-auto h-16 w-16 text-gray-500 mb-4" />
              <p className="text-gray-400 text-lg">No files uploaded yet</p>
              <p className="text-gray-500 text-sm mt-2">Upload files using the form above</p>
            </div>
          ) : (
            <div className="space-y-3">
              {files.map((file) => (
                <div
                  key={file._id}
                  className="bg-white/5 rounded-xl p-5 border border-white/10 hover:bg-white/10 transition-all"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4 flex-1">
                      {file.fileType === 'docx' ? (
                        <FileCode2 className="h-6 w-6 text-blue-400 mt-1 flex-shrink-0" />
                      ) : (
                        <FileText className="h-6 w-6 text-red-400 mt-1 flex-shrink-0" />
                      )}
                      <div className="flex-1">
                        <h3 className="text-white font-semibold text-lg mb-1">
                          {file.sopName}
                        </h3>
                        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                          <p className="text-gray-400">
                            File: <span className="text-gray-300">{file.fileName}</span>
                          </p>
                          <p className="text-gray-400">
                            Identifier: <span className="text-gray-300 font-mono">{file.sopIdentifier}</span>
                          </p>
                          <p className="text-gray-400">
                            Department: <span className="text-gray-300">{file.department}</span>
                          </p>
                          <p className="text-gray-400">
                            Size: <span className="text-gray-300">{formatFileSize(file.fileSize)}</span>
                          </p>
                          <p className="text-gray-400">
                            MCQs: <span className="text-green-300 font-semibold">{file.mcqCount}</span>
                          </p>
                          <p className="text-gray-400">
                            Uploaded: <span className="text-gray-300">{new Date(file.uploadedAt).toLocaleDateString()}</span>
                          </p>
                        </div>
                        <div className="mt-3 flex items-center gap-3">
                          <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold border ${getStatusColor(file.status)}`}>
                            {file.status.toUpperCase()}
                          </span>
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-mono font-semibold ${
                            file.fileType === 'docx'
                              ? 'text-blue-300 bg-blue-500/20'
                              : 'text-red-300 bg-red-500/20'
                          }`}>
                            {file.fileType.toUpperCase()}
                          </span>
                        </div>
                      </div>
                    </div>

                      <div className="flex items-center gap-2 ml-4">
                        <button
                          onClick={() => handlePreview(file)}
                          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-semibold rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all duration-200 transform hover:scale-105 active:scale-95 shadow-md"
                          title={`Preview ${file.fileType.toUpperCase()} file`}
                        >
                          <Eye className="h-4 w-4" />
                          Preview
                        </button>
                      <button
                        onClick={() => handleDeleteFile(file._id)}
                        className="p-2 hover:bg-red-500/20 rounded-lg transition-colors"
                        title="Delete file"
                      >
                        <Trash2 className="h-5 w-5 text-red-400" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
