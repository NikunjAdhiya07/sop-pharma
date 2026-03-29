'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  FolderOpen, 
  Sparkles, 
  Loader2, 
  CheckCircle2, 
  AlertCircle,
  Database,
  Upload,
  FileText,
  AlertTriangle,
  Eye
} from 'lucide-react';

interface ProcessProgress {
  total: number;
  completed: number;
  failed: number;
  current: string;
  errors: Array<{ fileName: string; error: string }>;
  results: Array<{ fileName: string; mcqCount: number; sopId: string }>;
  chunkProgress?: number;
  chunkTotal?: number;
}

export default function BulkProcessPage() {
  const router = useRouter();
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState<ProcessProgress | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [language, setLanguage] = useState<'English' | 'Gujarati'>('English');

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (!userData) {
      setTimeout(() => router.push('/login'), 0);
      return;
    }

    try {
      const user = JSON.parse(userData);
      if (user.role !== 'admin' && user.role !== 'qa-head' && user.role !== 'trainer') {
        setTimeout(() => router.push('/dashboard'), 0);
      }
    } catch (e) {
      setTimeout(() => router.push('/login'), 0);
    }
  }, [router]);

  const handleBulkProcess = async () => {
    const confirmed = window.confirm(
      'This will process all DOC/DOCX/PDF files in the "files" folder and generate ~100 MCQs from each file. This may take several minutes. Continue?'
    );

    if (!confirmed) return;

    setProcessing(true);
    setError('');
    setSuccess('');
    setProgress({
      total: 0,
      completed: 0,
      failed: 0,
      current: 'Initializing...',
      errors: [],
      results: []
    });

    try {
      const response = await fetch('/api/files/process-folder', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ language }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Processing failed');
      }

      // Stream progress updates
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

                if (progressData.completed + progressData.failed === progressData.total && progressData.total > 0) {
                  // Processing complete
                  const totalMCQs = progressData.results.reduce((sum: number, r: any) => sum + r.mcqCount, 0);
                  setSuccess(
                    `Bulk processing complete! Generated ${totalMCQs} MCQs from ${progressData.completed} file(s). ` +
                    `${progressData.failed > 0 ? `${progressData.failed} file(s) failed.` : ''}`
                  );
                }
              } catch (e) {
                console.error('Failed to parse progress:', e);
              }
            }
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Processing failed');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-12">
          <div className="flex items-center justify-between mb-4">
            <div className="flex-1 text-center">
              <h1 className="text-5xl font-bold text-white mb-4 bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-600">
                📁 Bulk MCQ Generator
              </h1>
              <p className="text-gray-300 text-lg">
                Process all SOP files from the "files" folder and generate MCQs in bulk
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
                Upload SOP
              </button>
            </div>
          </div>
        </div>

        {/* Instructions */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 shadow-2xl border border-white/20 mb-8">
          <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
            <FolderOpen className="h-7 w-7 text-blue-400" />
            How It Works
          </h2>
          <div className="space-y-4">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center text-white font-bold">
                1
              </div>
              <div>
                <h3 className="text-white font-semibold mb-1">Place Files in Folder</h3>
                <p className="text-gray-300">
                  Put all your SOP files (DOC, DOCX, or PDF) in the <code className="bg-white/10 px-2 py-1 rounded text-purple-300">files</code> folder at the root of your project
                </p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center text-white font-bold">
                2
              </div>
              <div>
                <h3 className="text-white font-semibold mb-1">Click Process Button</h3>
                <p className="text-gray-300">
                  Click the "Process All Files & Generate MCQs" button below
                </p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center text-white font-bold">
                3
              </div>
              <div>
                <h3 className="text-white font-semibold mb-1">Watch Progress</h3>
                <p className="text-gray-300">
                  Monitor real-time progress as each file is processed and MCQs are generated (~100 per file)
                </p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center text-white font-bold">
                4
              </div>
              <div>
                <h3 className="text-white font-semibold mb-1">View Results</h3>
                <p className="text-gray-300">
                  All generated MCQs are automatically stored in the MCQ Bank for future use
                </p>
              </div>
            </div>
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

        {/* Progress Section */}
        {progress && (
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 shadow-2xl border border-white/20 mb-8">
            <h2 className="text-2xl font-bold text-white mb-6">Processing Progress</h2>
            
            <div className="mb-6">
              <div className="flex justify-between text-white mb-2">
                <span>Files Processed: {progress.completed + progress.failed} / {progress.total}</span>
                <span>{progress.total > 0 ? Math.round(((progress.completed + progress.failed) / progress.total) * 100) : 0}%</span>
              </div>
              <div className="w-full bg-white/20 rounded-full h-4">
                <div
                  className="bg-gradient-to-r from-green-500 to-emerald-500 h-4 rounded-full transition-all duration-500"
                  style={{ width: `${progress.total > 0 ? ((progress.completed + progress.failed) / progress.total) * 100 : 0}%` }}
                />
              </div>
            </div>

            {progress.current && (
              <div className="bg-white/5 rounded-lg p-4 mb-4 border border-white/10">
                <div className="flex justify-between items-center mb-2">
                  <p className="text-gray-300 text-sm">Currently Processing:</p>
                  <p className="text-purple-300 text-xs font-mono">
                    {progress.chunkProgress || 0} / {progress.chunkTotal || 100} MCQs
                  </p>
                </div>
                <p className="text-white font-medium flex items-center gap-2 mb-3">
                  <Loader2 className="h-4 w-4 animate-spin text-purple-400" />
                  {progress.current}
                </p>
                {/* File Internal Progress Bar */}
                <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-purple-500 h-full transition-all duration-300 ease-out"
                    style={{ width: `${Math.min(100, ((progress.chunkProgress || 0) / (progress.chunkTotal || 100)) * 100)}%` }}
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-green-500/10 rounded-lg p-4 border border-green-500/30">
                <p className="text-green-300 text-sm mb-1">Completed</p>
                <p className="text-white text-2xl font-bold">{progress.completed}</p>
              </div>
              <div className="bg-red-500/10 rounded-lg p-4 border border-red-500/30">
                <p className="text-red-300 text-sm mb-1">Failed</p>
                <p className="text-white text-2xl font-bold">{progress.failed}</p>
              </div>
              <div className="bg-blue-500/10 rounded-lg p-4 border border-blue-500/30">
                <p className="text-blue-300 text-sm mb-1">Total MCQs</p>
                <p className="text-white text-2xl font-bold">
                  {progress.results.reduce((sum, r) => sum + r.mcqCount, 0)}
                </p>
              </div>
            </div>

            {/* Results */}
            {progress.results.length > 0 && (
              <div className="mb-6">
                <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-400" />
                  Successfully Processed ({progress.results.length})
                </h3>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {progress.results.map((result, idx) => (
                    <div key={idx} className="bg-green-500/10 rounded-lg p-3 border border-green-500/30">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <FileText className="h-4 w-4 text-green-400" />
                          <span className="text-white font-medium">{result.fileName}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-green-300 text-sm font-semibold">
                            {result.mcqCount} MCQs
                          </span>
                          <button
                            onClick={() => router.push(`/mcq-bank?sopId=${result.sopId}&lang=${language}`)}
                            className="p-1.5 bg-purple-500/20 text-purple-300 rounded-lg hover:bg-purple-500/30 border border-purple-500/30 transition-all"
                            title="View MCQs"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Errors */}
            {progress.errors.length > 0 && (
              <div className="bg-red-500/10 rounded-lg p-4 border border-red-500/30">
                <p className="text-red-300 font-semibold mb-3 flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5" />
                  Errors ({progress.errors.length})
                </p>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {progress.errors.map((err, idx) => (
                    <div key={idx} className="text-red-200 text-sm">
                      <span className="font-medium">{err.fileName}:</span> {err.error}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Action Button */}
        <div className="bg-gradient-to-br from-indigo-500/20 to-purple-500/20 backdrop-blur-lg rounded-2xl p-8 shadow-2xl border border-indigo-500/30">
          <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
            <Sparkles className="h-7 w-7 text-yellow-400" />
            Bulk MCQ Generation
          </h2>
          <p className="text-gray-300 mb-6">
            Process all DOC, DOCX, and PDF files from the &quot;files&quot; folder and generate approximately 100 MCQs from each file with full error checking and validation.
          </p>

          {/* Language Selection */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-300 mb-3">
              MCQ Language
            </label>
            <div className="flex gap-4">
              {(['English', 'Gujarati'] as const).map((lang) => (
                <button
                  key={lang}
                  type="button"
                  onClick={() => setLanguage(lang)}
                  disabled={processing}
                  className={`flex-1 py-4 px-6 rounded-xl border-2 transition-all flex items-center justify-center gap-3 disabled:opacity-50 ${
                    language === lang
                      ? 'border-purple-500 bg-purple-500/10 text-white shadow-lg shadow-purple-500/10'
                      : 'border-white/10 bg-white/5 text-gray-400 hover:border-white/20 hover:text-gray-300'
                  }`}
                >
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    language === lang ? 'border-purple-500 bg-purple-500' : 'border-slate-600'
                  }`}>
                    {language === lang && <div className="w-2 h-2 rounded-full bg-white" />}
                  </div>
                  <span className="font-bold text-lg">{lang}</span>
                </button>
              ))}
            </div>
            <p className="mt-2 text-sm text-gray-400">
              AI will generate MCQs in the selected language for all processed files.
            </p>
          </div>

          <button
            onClick={handleBulkProcess}
            disabled={processing}
            className="w-full py-4 px-6 bg-gradient-to-r from-yellow-600 to-orange-600 text-white font-bold rounded-xl hover:from-yellow-700 hover:to-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] shadow-lg"
          >
            {processing ? (
              <span className="flex items-center justify-center">
                <Loader2 className="animate-spin mr-2 h-5 w-5" />
                Processing... ({progress?.completed || 0}/{progress?.total || 0})
              </span>
            ) : (
              <span className="flex items-center justify-center">
                <Sparkles className="mr-2 h-5 w-5" />
                Process All Files & Generate MCQs
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
