import React, { useState, useRef } from 'react';
import { X, Upload, FileText, Loader2, CheckCircle2, AlertCircle, Files, Trash2 } from 'lucide-react';

interface TrainingMatrixUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function TrainingMatrixUploadModal({ isOpen, onClose, onSuccess }: TrainingMatrixUploadModalProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string; summary?: any } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [clearAll, setClearAll] = useState(false);

  if (!isOpen) return null;

  const onFilesSelected = (selectedFiles: File[]) => {
    if (selectedFiles.length === 0) return;
    setFiles(selectedFiles);
    setResult(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFilesSelected(Array.from(e.target.files));
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const dropped = Array.from(e.dataTransfer.files);
    if (dropped.length > 0) onFilesSelected(dropped);
  };

  const removeFile = (idx: number) => {
    const next = files.filter((_, i) => i !== idx);
    setFiles(next);
    if (next.length === 0) setResult(null);
  };

  const handleUpload = async () => {
    if (files.length === 0) return;
    setUploading(true);
    setResult(null);

    const formData = new FormData();
    files.forEach(file => formData.append('files', file));
    if (clearAll) formData.append('clearAll', 'true');

    try {
      const response = await fetch('/api/training-matrix/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();

      if (data.success) {
        setResult({
          success: true,
          message: `Successfully processed ${data.summary.totalSuccess} √-marked training entries from ${data.summary.totalFiles} file${data.summary.totalFiles !== 1 ? 's' : ''}.${data.summary.cleared ? ' All previous data was cleared first.' : ''}`,
          summary: data.summary,
        });
        if (onSuccess) onSuccess();
      } else {
        setResult({ success: false, message: data.error || 'Failed to process files' });
      }
    } catch {
      setResult({ success: false, message: 'An unexpected error occurred during processing.' });
    } finally {
      setUploading(false);
    }
  };

  const hasFiles = files.length > 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div
        className="bg-[#0f0d1e] border border-indigo-500/20 rounded-[32px] w-full max-w-xl shadow-2xl overflow-hidden max-h-[88vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-teal-600 to-emerald-600 p-6 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg backdrop-blur-md">
              <Files className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">Upload Training Matrix</h2>
              <p className="text-white/60 text-[10px] font-medium mt-0.5">
                Excel (.xlsx/.xls) or Word (.docx) — Month × SOP × √ format
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-lg transition-colors">
            <X className="h-6 w-6 text-white" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1">

          {/* Info box */}
          <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-2xl p-4 text-xs text-slate-400 leading-relaxed space-y-1">
            <p className="font-bold text-indigo-300 text-[11px] mb-2">📋 Expected Matrix Format</p>
            <p>• Columns represent <span className="text-white font-bold">month names</span> (January–December)</p>
            <p>• Sub-columns under each month hold <span className="text-white font-bold">SOP codes</span> (e.g. QAGE01)</p>
            <p>• Rows are <span className="text-white font-bold">employee names</span></p>
            <p>
              • Symbol <span className="text-emerald-400 font-black">√</span> = Training Required &nbsp;|&nbsp;{' '}
              <span className="text-rose-400">X</span> / <span className="text-slate-500">NA</span> = Ignored
            </p>
          </div>

          {/* Drop Zone */}
          <div
            onClick={() => fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={e => e.preventDefault()}
            className={`cursor-pointer border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center gap-4 transition-all ${
              hasFiles
                ? 'border-teal-500/40 bg-teal-500/5'
                : 'border-indigo-500/20 bg-indigo-500/5 hover:bg-indigo-500/10 hover:border-indigo-500/40'
            }`}
          >
            {hasFiles ? (
              <>
                <div className="p-3 bg-teal-500/20 rounded-xl border border-teal-500/30 text-teal-400">
                  <Files className="h-8 w-8" />
                </div>
                <div className="text-center">
                  <p className="text-teal-400 font-bold text-sm">
                    {files.length} file{files.length > 1 ? 's' : ''} selected
                  </p>
                  <p className="text-gray-500 text-xs mt-1">Click to add more files</p>
                </div>
              </>
            ) : (
              <>
                <div className="p-4 rounded-full bg-teal-500/10 text-teal-400">
                  <Upload className="h-8 w-8" />
                </div>
                <div className="text-center">
                  <p className="text-teal-100 font-bold text-sm">Drop your matrix files here or click to browse</p>
                  <p className="text-gray-500 text-xs mt-1">
                    .xlsx, .xls (Excel) or .docx (Word) — multiple files supported
                  </p>
                </div>
              </>
            )}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".xlsx,.xls,.docx"
              multiple
              className="hidden"
            />
          </div>

          {/* File List */}
          {hasFiles && (
            <div className="space-y-2">
              <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest">
                Selected Files ({files.length})
              </p>
              <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                {files.map((f, idx) => {
                  const isXls = f.name.endsWith('.xlsx') || f.name.endsWith('.xls');
                  return (
                    <div
                      key={idx}
                      className="flex items-center gap-3 bg-white/[0.03] border border-white/5 rounded-xl px-3 py-2"
                    >
                      <div className={`p-1.5 rounded-lg ${isXls ? 'bg-emerald-500/15 text-emerald-400' : 'bg-blue-500/15 text-blue-400'}`}>
                        <FileText className="h-3.5 w-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-white truncate">{f.name}</p>
                        <p className="text-[10px] text-gray-600">
                          {isXls ? '📊 Excel' : '📄 Word'} · {(f.size / 1024).toFixed(1)} KB
                        </p>
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); removeFile(idx); }}
                        className="p-1 hover:bg-rose-500/20 rounded-lg text-gray-600 hover:text-rose-400 transition-colors"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Clear All Toggle */}
          <div
            className={`flex items-start gap-3 p-4 rounded-2xl border cursor-pointer transition-all ${
              clearAll
                ? 'bg-rose-500/10 border-rose-500/30'
                : 'bg-white/[0.03] border-white/5 hover:border-white/10'
            }`}
            onClick={() => setClearAll(v => !v)}
          >
            <div className={`mt-0.5 w-4 h-4 rounded flex items-center justify-center border-2 shrink-0 transition-all ${
              clearAll ? 'bg-rose-500 border-rose-500' : 'border-gray-600'
            }`}>
              {clearAll && <span className="text-white text-[10px] font-black">✓</span>}
            </div>
            <div>
              <p className={`text-xs font-black ${clearAll ? 'text-rose-400' : 'text-gray-300'}`}>
                🗑 Clear ALL existing training data before import
              </p>
              <p className="text-[10px] text-gray-600 mt-0.5 leading-relaxed">
                {clearAll
                  ? '⚠️ All current matrix records will be permanently deleted, then fresh data will be imported.'
                  : 'Enable to wipe existing records first so the uploaded files become the single source of truth.'}
              </p>
            </div>
          </div>

          {result && (
            <div className={`p-4 rounded-xl flex items-start gap-3 border ${
              result.success
                ? 'bg-teal-500/10 border-teal-500/20 text-teal-400'
                : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
            }`}>
              {result.success ? <CheckCircle2 className="h-5 w-5 shrink-0" /> : <AlertCircle className="h-5 w-5 shrink-0" />}
              <div className="flex-1">
                <p className="text-xs font-bold mb-1">{result.success ? 'Success' : 'Failed'}</p>
                <p className="text-[11px] font-medium leading-relaxed opacity-80">{result.message}</p>
                {result.summary && (
                  <div className="flex gap-4 mt-2">
                    <span className="text-[10px]">📁 {result.summary.totalFiles} files</span>
                    <span className="text-[10px] text-teal-300">✓ {result.summary.totalSuccess} entries saved</span>
                    {result.summary.totalFailed > 0 && (
                      <span className="text-[10px] text-rose-400">✗ {result.summary.totalFailed} failed</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="p-6 pt-0 flex gap-3 shrink-0">
          <button
            onClick={onClose}
            className="flex-1 py-3.5 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white rounded-xl font-bold transition-all border border-white/5 uppercase tracking-widest text-[10px]"
          >
            Cancel
          </button>
          <button
            disabled={files.length === 0 || uploading}
            onClick={handleUpload}
            className={`flex-1 py-3.5 rounded-xl font-bold transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 text-white ${
              clearAll
                ? 'bg-gradient-to-r from-rose-600 to-orange-600 hover:from-rose-700 hover:to-orange-700 shadow-rose-500/20'
                : 'bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 shadow-teal-500/20'
            }`}
          >
            {uploading ? (
              <><Loader2 className="h-4 w-4 animate-spin" />Processing {files.length} file{files.length > 1 ? 's' : ''}...</>
            ) : clearAll ? (
              <><Trash2 className="h-4 w-4" />Clear &amp; Import {files.length} File{files.length > 1 ? 's' : ''}</>
            ) : (
              <>Process {files.length} Matrix File{files.length > 1 ? 's' : ''}</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
