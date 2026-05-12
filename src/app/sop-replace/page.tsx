'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import {
  Upload,
  FileText,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ArrowLeft,
  History,
  Shield,
  RefreshCw,
} from 'lucide-react';
import PageHeader from '@/components/PageHeader';

interface SOPInfo {
  _id: string;
  name: string;
  identifier: string;
  department: string;
  version: string;
  language: string;
  mcqCount: number;
  status: string;
  uploadedAt: string;
}

interface ArchiveRecord {
  _id: string;
  version: string;
  name: string;
  identifier: string;
  archivedAt: string;
  archiveReason?: string;
  replacedByVersion?: string;
  mcqBank?: {
    totalQuestions: number;
    sopVersion: string;
  } | null;
}

function ReplaceSOPContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sopId = searchParams.get('sopId');

  const [sopInfo, setSopInfo] = useState<SOPInfo | null>(null);
  const [archives, setArchives] = useState<ArchiveRecord[]>([]);
  const [loadingInfo, setLoadingInfo] = useState(true);
  const [loadingArchives, setLoadingArchives] = useState(true);

  // Form state
  const [file, setFile] = useState<File | null>(null);
  const [archiveReason, setArchiveReason] = useState('Updated SOP content');
  const [replacing, setReplacing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [newSopResult, setNewSopResult] = useState<{
    newVersion: string;
    previousVersion: string;
    mcqsArchived: boolean;
  } | null>(null);

  useEffect(() => {
    if (!sopId) return;
    fetchSOPInfo();
    fetchArchives();
  }, [sopId]);

  const fetchSOPInfo = async () => {
    try {
      setLoadingInfo(true);
      const res = await fetch(`/api/sop/${sopId}`);
      const data = await res.json();
      if (data.success && data.sop) {
        setSopInfo(data.sop);
      }
    } catch (err) {
      console.error('Error fetching SOP info:', err);
    } finally {
      setLoadingInfo(false);
    }
  };

  const fetchArchives = async () => {
    try {
      setLoadingArchives(true);
      const res = await fetch(`/api/sop/${sopId}/archives`);
      const data = await res.json();
      if (data.success) {
        setArchives(data.archives || []);
      }
    } catch (err) {
      console.error('Error fetching archives:', err);
    } finally {
      setLoadingArchives(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      const ext = selectedFile.name.split('.').pop()?.toLowerCase();
      if (ext === 'pdf' || ext === 'docx') {
        setFile(selectedFile);
        setError('');
      } else {
        setError('Only PDF and DOCX files are supported.');
        setFile(null);
      }
    }
  };

  const handleReplace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !sopId) {
      setError('Please select a file to replace the SOP.');
      return;
    }

    setReplacing(true);
    setError('');
    setSuccess('');

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('sopId', sopId);
      formData.append('archiveReason', archiveReason);

      const res = await fetch('/api/sop/replace', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Replacement failed');
      }

      setSuccess(data.message);
      setNewSopResult({
        newVersion: data.sop.newVersion,
        previousVersion: data.sop.previousVersion,
        mcqsArchived: data.archive.mcqsArchived,
      });
      setFile(null);

      // Refresh archive list
      await fetchArchives();
      await fetchSOPInfo();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Replacement failed');
    } finally {
      setReplacing(false);
    }
  };

  if (!sopId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
          <p className="text-white text-xl">No SOP ID provided.</p>
          <button
            onClick={() => router.push('/sop-library')}
            className="mt-4 px-6 py-3 bg-purple-600 text-white rounded-xl font-semibold hover:bg-purple-700 transition-colors"
          >
            Go to Library
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-8">
      <div className="max-w-4xl mx-auto">
        <PageHeader />

        {/* Back Button */}
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-gray-300 hover:text-white mb-8 transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
          Back
        </button>

        {/* Title */}
        <div className="mb-10 text-center">
          <div className="inline-flex items-center gap-3 mb-3">
            <div className="p-3 bg-orange-500/20 rounded-2xl border border-orange-500/30">
              <RefreshCw className="h-8 w-8 text-orange-400" />
            </div>
          </div>
          <h1 className="text-4xl font-bold text-white mb-3">
            Replace SOP
          </h1>
          <p className="text-gray-300 text-lg">
            Upload a new version of the SOP. The old version and its MCQs will be automatically archived.
          </p>
        </div>

        {/* Current SOP Info */}
        {loadingInfo ? (
          <div className="bg-white/10 rounded-2xl p-6 mb-8 flex justify-center">
            <Loader2 className="h-6 w-6 text-purple-400 animate-spin" />
          </div>
        ) : sopInfo && (
          <div className="bg-gradient-to-r from-slate-800/80 to-slate-700/80 backdrop-blur-lg rounded-2xl p-6 mb-8 border border-white/10 shadow-xl">
            <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4">Current Live Version</h2>
            <div className="flex flex-wrap gap-4 items-start">
              <div className="flex-1 min-w-[200px]">
                <p className="text-white font-bold text-lg mb-1">{sopInfo.name}</p>
                <p className="text-gray-400 text-sm font-mono">{sopInfo.identifier}</p>
              </div>
              <div className="flex flex-wrap gap-3">
                <span className="px-4 py-1.5 bg-purple-500/20 text-purple-300 rounded-full text-sm font-bold border border-purple-500/30">
                  v{sopInfo.version || '1.0'}
                </span>
                <span className="px-4 py-1.5 bg-blue-500/20 text-blue-300 rounded-full text-sm font-bold border border-blue-500/30">
                  {sopInfo.department}
                </span>
                <span className="px-4 py-1.5 bg-green-500/20 text-green-300 rounded-full text-sm font-bold border border-green-500/30">
                  {sopInfo.mcqCount} MCQs
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Replace Form */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 shadow-2xl border border-white/20 mb-8">
          <div className="flex items-center gap-3 mb-6">
            <Shield className="h-5 w-5 text-orange-400" />
            <h2 className="text-xl font-bold text-white">Upload New Version</h2>
          </div>

          {newSopResult && (
            <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-5 mb-6">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-6 w-6 text-green-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-green-200 font-bold mb-1">SOP Successfully Replaced!</p>
                  <p className="text-gray-300 text-sm mb-2">
                    Version <span className="text-white font-mono">{newSopResult.previousVersion}</span>
                    {' '}was archived. The SOP is now at version{' '}
                    <span className="text-green-300 font-mono font-bold">{newSopResult.newVersion}</span>.
                  </p>
                  {newSopResult.mcqsArchived && (
                    <p className="text-yellow-300 text-sm">
                      ⚠️ The old MCQ bank has been archived. Please regenerate MCQs for the new version.
                    </p>
                  )}
                  <button
                    onClick={() => router.push(`/sop-library/${sopId}`)}
                    className="mt-3 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg transition-colors"
                  >
                    View SOP & Regenerate MCQs
                  </button>
                </div>
              </div>
            </div>
          )}

          <form onSubmit={handleReplace} className="space-y-6">
            {/* File Upload */}
            <div>
              <label className="block text-white font-semibold mb-3">
                New SOP File <span className="text-gray-400 text-sm font-normal">(PDF or DOCX)</span>
              </label>
              <label
                htmlFor="replace-file-upload"
                className={`flex items-center justify-center w-full px-6 py-10 border-2 border-dashed rounded-xl cursor-pointer transition-all duration-300 ${
                  file
                    ? 'border-green-500 bg-green-500/10'
                    : 'border-orange-400/50 hover:border-orange-400 hover:bg-white/5'
                }`}
              >
                <div className="text-center">
                  {file ? (
                    <>
                      <CheckCircle2 className="mx-auto h-10 w-10 text-green-400 mb-2" />
                      <p className="text-green-300 font-semibold">{file.name}</p>
                      <p className="text-gray-400 text-sm mt-1">
                        {(file.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </>
                  ) : (
                    <>
                      <Upload className="mx-auto h-10 w-10 text-orange-400 mb-2" />
                      <p className="text-white font-medium">Click to upload new SOP file</p>
                      <p className="text-gray-400 text-sm mt-1">PDF or DOCX only</p>
                    </>
                  )}
                </div>
                <input
                  id="replace-file-upload"
                  type="file"
                  accept=".pdf,.docx"
                  onChange={handleFileChange}
                  className="hidden"
                  disabled={replacing}
                />
              </label>
            </div>

            {/* Archive Reason */}
            <div>
              <label className="block text-white font-semibold mb-3">
                Archive Reason <span className="text-gray-400 text-sm font-normal">(optional note)</span>
              </label>
              <input
                type="text"
                value={archiveReason}
                onChange={(e) => setArchiveReason(e.target.value)}
                placeholder="e.g., Updated regulatory references, Process improvement"
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all"
                disabled={replacing}
              />
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/30 rounded-xl p-4">
                <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-red-200">{error}</p>
              </div>
            )}

            {/* Warning */}
            <div className="flex items-start gap-3 bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4">
              <AlertCircle className="h-5 w-5 text-yellow-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-yellow-200">
                <p className="font-bold mb-1">What will happen:</p>
                <ul className="list-disc list-inside space-y-1 text-yellow-300/80">
                  <li>Current SOP content will be archived (not deleted).</li>
                  <li>Existing MCQ Bank will be archived and removed from live.</li>
                  <li>SOP version will be incremented (e.g., 1.0 → 1.1).</li>
                  <li>You will need to regenerate MCQs for the new version.</li>
                </ul>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={replacing || !file}
              className="w-full py-4 px-6 bg-gradient-to-r from-orange-600 to-red-600 text-white font-bold rounded-xl hover:from-orange-700 hover:to-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 transform hover:scale-[1.01] active:scale-[0.99] shadow-lg shadow-orange-500/20"
            >
              {replacing ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Replacing & Archiving...
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <RefreshCw className="h-5 w-5" />
                  Replace SOP (Archive Current Version)
                </span>
              )}
            </button>
          </form>
        </div>

        {/* Version History / Archives */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 shadow-2xl border border-white/20">
          <div className="flex items-center gap-3 mb-6">
            <History className="h-5 w-5 text-purple-400" />
            <h2 className="text-xl font-bold text-white">Version History</h2>
            <span className="px-3 py-1 bg-purple-500/20 text-purple-300 rounded-full text-sm font-semibold">
              {archives.length} archived
            </span>
          </div>

          {loadingArchives ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 text-purple-400 animate-spin" />
            </div>
          ) : archives.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed border-gray-700 rounded-xl">
              <History className="h-12 w-12 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400 mb-1">No archived versions yet</p>
              <p className="text-gray-600 text-sm">Previous versions will appear here after replacement.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {archives.map((archive, index) => (
                <div
                  key={archive._id}
                  className="bg-slate-800/60 rounded-xl p-5 border border-white/10 hover:border-purple-500/20 transition-all"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-gray-400 font-bold text-sm border border-white/10">
                        v{archive.version}
                      </div>
                      <div>
                        <p className="text-white font-semibold text-sm">{archive.name}</p>
                        <p className="text-gray-500 text-xs font-mono">{archive.identifier}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {archive.mcqBank && (
                        <span className="px-3 py-1 bg-green-500/20 text-green-300 text-xs rounded-full border border-green-500/30 font-semibold">
                          📝 {archive.mcqBank.totalQuestions} MCQs Archived
                        </span>
                      )}
                      {archive.replacedByVersion && (
                        <span className="px-3 py-1 bg-blue-500/20 text-blue-300 text-xs rounded-full border border-blue-500/30 font-semibold">
                          → Replaced by v{archive.replacedByVersion}
                        </span>
                      )}
                    </div>
                  </div>

                  {archive.archiveReason && (
                    <p className="text-gray-400 text-sm mt-3 pl-13 ml-13">
                      📋 Reason: <span className="text-gray-300 italic">{archive.archiveReason}</span>
                    </p>
                  )}
                  <p className="text-gray-600 text-xs mt-2">
                    Archived on {new Date(archive.archivedAt).toLocaleString('en-IN', {
                      day: 'numeric', month: 'short', year: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ReplaceSOPPage() {
  useAuthGuard();
  return (
    <React.Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <Loader2 className="h-12 w-12 text-purple-400 animate-spin" />
      </div>
    }>
      <ReplaceSOPContent />
    </React.Suspense>
  );
}
