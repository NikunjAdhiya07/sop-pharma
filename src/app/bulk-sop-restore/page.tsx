'use client';

import { useState, useEffect } from 'react';
import { Upload, FileText, CheckCircle2, Loader2, AlertCircle, RefreshCw, CalendarClock, XCircle } from 'lucide-react';
import PageHeader from '@/components/PageHeader';

interface SOP {
  _id: string;
  name: string;
  identifier: string;
  department: string;
  reviewDate?: string;
}

interface MatchedPair {
  file: File;
  sop: SOP;
  status: 'pending' | 'uploading' | 'success' | 'error';
  message?: string;
  reviewDate?: string;
  reviewDateSource?: 'manual' | 'extracted' | 'calculated';
}

export default function BulkSOPRestorePage() {
  const [sops, setSops] = useState<SOP[]>([]);
  const [loadingSOPs, setLoadingSOPs] = useState(true);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [matchedPairs, setMatchedPairs] = useState<MatchedPair[]>([]);
  const [unmatchedFiles, setUnmatchedFiles] = useState<File[]>([]);
  const [remainingSOPs, setRemainingSOPs] = useState<SOP[]>([]);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [overallProgress, setOverallProgress] = useState(0);

  const [overrideEffectiveDate, setOverrideEffectiveDate] = useState('');
  const [overrideReviewDate, setOverrideReviewDate] = useState('');

  useEffect(() => {
    const fetchSOPs = async () => {
      try {
        const res = await fetch('/api/sop/list?limit=10000');
        const data = await res.json();
        if (data.success) {
          setSops(data.sops);
        }
      } catch (error) {
        console.error('Failed to fetch SOPs:', error);
      } finally {
        setLoadingSOPs(false);
      }
    };
    fetchSOPs();
  }, []);

  useEffect(() => {
    if (sops.length === 0) return;

    const matched: MatchedPair[] = [];
    const unmatched: File[] = [];
    const matchedSopIds = new Set<string>();

    selectedFiles.forEach((file) => {
      const fileNameUpper = file.name.toUpperCase();
      const filePrefix = file.name.split('_')[0].toUpperCase();

      // 1. Try exact match with prefix
      let match = sops.find((sop) => sop.identifier.toUpperCase() === filePrefix);

      // 2. Try if filename includes sop identifier (longest identifier first to avoid partial matches)
      if (!match) {
        const sortedSops = [...sops].sort((a, b) => b.identifier.length - a.identifier.length);
        match = sortedSops.find((sop) => fileNameUpper.includes(sop.identifier.toUpperCase()));
      }

      // 3. Try if sop identifier includes the prefix
      if (!match) {
        match = sops.find((sop) => sop.identifier.toUpperCase().includes(filePrefix));
      }

      if (match) {
        matched.push({ file, sop: match, status: 'pending' });
        matchedSopIds.add(match._id);
      } else {
        unmatched.push(file);
      }
    });

    const remaining = sops.filter(sop => !matchedSopIds.has(sop._id));

    setMatchedPairs(matched);
    setUnmatchedFiles(unmatched);
    setRemainingSOPs(remaining);
  }, [selectedFiles, sops]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files).filter(
        file => file.name.endsWith('.docx') || file.name.endsWith('.pdf')
      );
      setSelectedFiles(prev => [...prev, ...filesArray]);
    }
  };

  const clearFiles = () => {
    setSelectedFiles([]);
    setMatchedPairs([]);
    setUnmatchedFiles([]);
    setOverallProgress(0);
    setOverrideEffectiveDate('');
    setOverrideReviewDate('');
  };

  const handleBulkRestore = async () => {
    if (matchedPairs.length === 0) return;
    setIsProcessing(true);
    setOverallProgress(0);

    let completed = 0;
    const newPairs = [...matchedPairs];

    for (let i = 0; i < newPairs.length; i++) {
      const pair = newPairs[i];
      if (pair.status === 'success') continue;

      // Update status to uploading
      newPairs[i].status = 'uploading';
      setMatchedPairs([...newPairs]);

      try {
        const formData = new FormData();
        formData.append('file', pair.file);
        formData.append('identifier', pair.sop.identifier);
        if (overrideEffectiveDate) formData.append('effectiveDate', overrideEffectiveDate);
        if (overrideReviewDate) formData.append('reviewDate', overrideReviewDate);

        const res = await fetch('/api/sop/bulk-file-restore', {
          method: 'POST',
          body: formData
        });

        const data = await res.json();
        if (res.ok && data.success) {
          newPairs[i].status = 'success';
          newPairs[i].message = 'Restored successfully';
          newPairs[i].reviewDate = data.sop?.reviewDate;
          newPairs[i].reviewDateSource = data.sop?.reviewDateSource;
        } else {
          newPairs[i].status = 'error';
          newPairs[i].message = data.error || 'Failed to restore';
        }
      } catch (err: any) {
        newPairs[i].status = 'error';
        newPairs[i].message = err.message || 'Network error';
      }

      completed++;
      setOverallProgress(Math.round((completed / newPairs.length) * 100));
      setMatchedPairs([...newPairs]);
    }

    setIsProcessing(false);
  };

  const isRestoreComplete = matchedPairs.length > 0 && matchedPairs.every(p => p.status === 'success' || p.status === 'error');

  // ── Manual Review Date Restore ────────────────────────────────────────────
  interface RestoreResult {
    identifier: string;
    status: 'fixed' | 'skip' | 'error';
    reviewDate?: string;
    dateSource?: string;
    reason?: string;
  }
  const [isDateRestoring, setIsDateRestoring] = useState(false);
  const [dateRestoreResults, setDateRestoreResults] = useState<RestoreResult[]>([]);
  const [dateRestoreStats, setDateRestoreStats] = useState<{ total: number; fixed: number; skipped: number; failed: number } | null>(null);
  const [dateRestoreProgress, setDateRestoreProgress] = useState(0);

  const handleManualDateRestore = async () => {
    setIsDateRestoring(true);
    setDateRestoreResults([]);
    setDateRestoreStats(null);
    setDateRestoreProgress(0);

    try {
      const res = await fetch('/api/sop/restore-review-dates', { method: 'POST' });
      if (!res.body) throw new Error('No response stream');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === 'init') {
              setDateRestoreProgress(0);
            } else if (event.type === 'fixed') {
              setDateRestoreResults(prev => [...prev, { identifier: event.identifier, status: 'fixed', reviewDate: event.reviewDate, dateSource: event.dateSource }]);
              setDateRestoreProgress(prev => prev + 1);
            } else if (event.type === 'skip') {
              setDateRestoreResults(prev => [...prev, { identifier: event.identifier, status: 'skip', reason: event.reason }]);
              setDateRestoreProgress(prev => prev + 1);
            } else if (event.type === 'error') {
              setDateRestoreResults(prev => [...prev, { identifier: event.identifier, status: 'error', reason: event.reason }]);
              setDateRestoreProgress(prev => prev + 1);
            } else if (event.type === 'done') {
              setDateRestoreStats({ total: event.total, fixed: event.fixed, skipped: event.skipped, failed: event.failed });
            }
          } catch { /* skip malformed line */ }
        }
      }
    } catch (err: any) {
      setDateRestoreResults(prev => [...prev, { identifier: '—', status: 'error', reason: err.message }]);
    } finally {
      setIsDateRestoring(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-8">
      <div className="max-w-6xl mx-auto">
        <PageHeader />

        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-4">Bulk SOP File Restore</h1>
          <p className="text-gray-300">
            Upload your DOCX/PDF files here. We will match them against existing SOPs by Document Number. 
            The file links and review dates will be updated in the system, leaving the rest of the SOP data intact.
          </p>
        </div>

        {/* Upload Box */}
        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-8 shadow-xl border border-white/20 mb-8">
          <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-purple-400 rounded-xl cursor-pointer hover:bg-white/5 transition-all">
            <div className="flex flex-col items-center justify-center pt-5 pb-6">
              <Upload className="w-10 h-10 text-purple-400 mb-3" />
              <p className="mb-2 text-lg text-white font-semibold">Click to browse or drop folder/files</p>
              <p className="text-sm text-gray-400">PDF or DOCX files only</p>
            </div>
            {/* Note: directory selection requires webkitdirectory attribute */}
            <input 
              type="file" 
              className="hidden" 
              multiple 
              accept=".pdf,.docx" 
              onChange={handleFileChange} 
              disabled={isProcessing}
            />
          </label>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Column: Matched Files */}
          <div className="bg-white/5 backdrop-blur-md rounded-2xl p-6 border border-white/10">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold text-white flex items-center">
                <CheckCircle2 className="mr-2 text-green-400" /> Matched SOPs ({matchedPairs.length})
              </h2>
              {matchedPairs.length > 0 && !isProcessing && (
                <button 
                  onClick={clearFiles}
                  className="px-3 py-1 bg-white/10 hover:bg-white/20 rounded-md text-sm text-white transition-colors"
                >
                  Clear Selection
                </button>
              )}
            </div>

            {matchedPairs.length > 0 ? (
              <div className="space-y-3 max-h-96 overflow-y-auto pr-2 custom-scrollbar">
                {matchedPairs.map((pair, idx) => (
                  <div key={idx} className="bg-slate-800/80 p-3 rounded-lg flex items-center justify-between border border-white/5">
                    <div className="truncate pr-4 flex-1">
                      <p className="text-white font-medium truncate">{pair.sop.identifier}</p>
                      <p className="text-xs text-gray-400 truncate">{pair.file.name}</p>
                      {pair.status === 'success' && pair.reviewDate && (
                        <p className="text-[10px] mt-0.5 text-emerald-400">
                          Review: {new Date(pair.reviewDate).toLocaleDateString()}
                          {pair.reviewDateSource === 'extracted' && (
                            <span className="ml-1 text-blue-400">(from doc)</span>
                          )}
                          {pair.reviewDateSource === 'manual' && (
                            <span className="ml-1 text-purple-400">(manual)</span>
                          )}
                        </p>
                      )}
                    </div>
                    <div>
                      {pair.status === 'pending' && <span className="text-xs px-2 py-1 bg-yellow-500/20 text-yellow-400 rounded">Ready</span>}
                      {pair.status === 'uploading' && <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />}
                      {pair.status === 'success' && <CheckCircle2 className="w-4 h-4 text-green-400" />}
                      {pair.status === 'error' && (
                        <div className="flex flex-col items-end" title={pair.message}>
                           <AlertCircle className="w-4 h-4 text-red-400" />
                           <span className="text-[10px] text-red-400 mt-1 truncate max-w-[100px]">{pair.message}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-10 text-gray-500">
                No matched files yet. Select files to begin matching.
              </div>
            )}

            {matchedPairs.length > 0 && (
              <div className="mt-6 space-y-4">
                {!isProcessing && !isRestoreComplete && (
                  <div className="bg-white/5 p-4 rounded-xl border border-white/10 space-y-3">
                    <p className="text-sm text-gray-300 font-medium">Optional: Override Dates for all matched files</p>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Effective Date</label>
                        <input 
                          type="date" 
                          value={overrideEffectiveDate}
                          onChange={(e) => setOverrideEffectiveDate(e.target.value)}
                          className="w-full bg-slate-800 border border-white/10 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500 [color-scheme:dark]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Review Date</label>
                        <input 
                          type="date" 
                          value={overrideReviewDate}
                          onChange={(e) => setOverrideReviewDate(e.target.value)}
                          className="w-full bg-slate-800 border border-white/10 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500 [color-scheme:dark]"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {isProcessing ? (
                  <div>
                    <div className="flex justify-between text-xs text-gray-400 mb-1">
                      <span>Restoring...</span>
                      <span>{overallProgress}%</span>
                    </div>
                    <div className="w-full bg-gray-700 rounded-full h-2">
                      <div className="bg-green-500 h-2 rounded-full transition-all" style={{ width: `${overallProgress}%` }}></div>
                    </div>
                  </div>
                ) : isRestoreComplete ? (
                  <div className="w-full py-3 bg-green-500/20 text-green-400 font-bold rounded-xl border border-green-500/30 flex items-center justify-center shadow-lg">
                    <CheckCircle2 className="mr-2" /> Restore Complete!
                  </div>
                ) : (
                  <button 
                    onClick={handleBulkRestore}
                    className="w-full py-3 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-bold rounded-xl transition-all shadow-lg"
                  >
                    Start Restore ({matchedPairs.length} files)
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Right Column: Unmatched / Remaining */}
          <div className="space-y-6">
            {/* Unmatched Files */}
            <div className="bg-white/5 backdrop-blur-md rounded-2xl p-6 border border-white/10">
              <h2 className="text-xl font-bold text-white mb-4 flex items-center">
                <AlertCircle className="mr-2 text-yellow-400" /> Unmatched Files ({unmatchedFiles.length})
              </h2>
              {unmatchedFiles.length > 0 ? (
                <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar">
                  {unmatchedFiles.map((f, i) => (
                    <div key={i} className="text-sm text-gray-300 truncate bg-white/5 p-2 rounded">
                      {f.name}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-gray-500">All selected files matched successfully!</div>
              )}
            </div>

            {/* Remaining SOPs */}
            <div className="bg-white/5 backdrop-blur-md rounded-2xl p-6 border border-white/10">
              <h2 className="text-xl font-bold text-white mb-4 flex items-center">
                <FileText className="mr-2 text-blue-400" /> Remaining SOPs in DB ({remainingSOPs.length})
              </h2>
              {loadingSOPs ? (
                <div className="flex items-center text-gray-400 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading database SOPs...
                </div>
              ) : remainingSOPs.length > 0 ? (
                <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
                  {remainingSOPs.map((sop) => (
                    <div key={sop._id} className="flex flex-col bg-white/5 p-2 rounded">
                      <span className="text-sm font-semibold text-white">{sop.identifier}</span>
                      <span className="text-xs text-gray-400 truncate">{sop.name}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-gray-500">All database SOPs have been matched!</div>
              )}
            </div>
          </div>
        </div>

        {/* ── Manual Review Date Restore ──────────────────────────────────── */}
        <div className="mt-10 bg-white/5 backdrop-blur-md rounded-2xl p-6 border border-white/10">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <CalendarClock className="text-cyan-400 w-5 h-5" /> Manual Restore Review Dates
              </h2>
              <p className="text-sm text-gray-400 mt-1">
                Scans every SOP stored in Bunny, downloads the DOCX, extracts the Review Date directly from the header table, and updates the database. No file upload needed.
              </p>
            </div>
            <button
              onClick={handleManualDateRestore}
              disabled={isDateRestoring}
              className="shrink-0 flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all shadow-lg"
            >
              {isDateRestoring ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {isDateRestoring ? 'Restoring…' : 'Restore Review Dates'}
            </button>
          </div>

          {/* Progress bar */}
          {isDateRestoring && dateRestoreStats === null && dateRestoreResults.length > 0 && (
            <div className="mt-4">
              <div className="flex justify-between text-xs text-gray-400 mb-1">
                <span>Processing…</span>
                <span>{dateRestoreProgress} done</span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2">
                <div
                  className="bg-cyan-500 h-2 rounded-full transition-all"
                  style={{ width: dateRestoreResults.length > 0 ? '100%' : '0%', animation: 'pulse 1.5s infinite' }}
                />
              </div>
            </div>
          )}

          {/* Summary stats */}
          {dateRestoreStats && (
            <div className="mt-4 grid grid-cols-4 gap-3 text-center">
              {[
                { label: 'Total', value: dateRestoreStats.total, color: 'text-white' },
                { label: 'Fixed', value: dateRestoreStats.fixed, color: 'text-emerald-400' },
                { label: 'Skipped', value: dateRestoreStats.skipped, color: 'text-yellow-400' },
                { label: 'Failed', value: dateRestoreStats.failed, color: 'text-red-400' },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-slate-800/80 rounded-lg p-3 border border-white/5">
                  <p className={`text-2xl font-bold ${color}`}>{value}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{label}</p>
                </div>
              ))}
            </div>
          )}

          {/* Per-SOP results */}
          {dateRestoreResults.length > 0 && (
            <div className="mt-4 space-y-1.5 max-h-72 overflow-y-auto pr-1 custom-scrollbar">
              {dateRestoreResults.map((r, i) => (
                <div key={i} className="flex items-center justify-between bg-slate-800/70 px-3 py-2 rounded-lg border border-white/5 text-sm">
                  <span className="font-mono text-white text-xs">{r.identifier}</span>
                  <div className="flex items-center gap-2 text-xs">
                    {r.status === 'fixed' && (
                      <>
                        <span className="text-emerald-400 font-semibold">
                          {r.reviewDate ? new Date(r.reviewDate).toLocaleDateString() : '—'}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          r.dateSource === 'header-table' ? 'bg-blue-500/20 text-blue-300' :
                                                            'bg-purple-500/20 text-purple-300'
                        }`}>
                          {r.dateSource === 'header-table' ? 'from doc' : 'regex'}
                        </span>
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      </>
                    )}
                    {r.status === 'skip' && (
                      <>
                        <span className="text-yellow-400">{r.reason}</span>
                        <XCircle className="w-3.5 h-3.5 text-yellow-400" />
                      </>
                    )}
                    {r.status === 'error' && (
                      <>
                        <span className="text-red-400 truncate max-w-[180px]">{r.reason}</span>
                        <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                      </>
                    )}
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
