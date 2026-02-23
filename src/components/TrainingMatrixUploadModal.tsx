import React, { useState, useRef } from 'react';
import { X, Upload, FileText, Loader2, CheckCircle2, AlertCircle, Files } from 'lucide-react';

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

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
      setResult(null);
    }
  };

  const handleUpload = async () => {
    if (files.length === 0) return;

    setUploading(true);
    setResult(null);

    const formData = new FormData();
    files.forEach(file => {
      formData.append('files', file);
    });

    try {
      const response = await fetch('/api/training-matrix/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (data.success) {
        setResult({ 
          success: true, 
          message: `Successfully processed ${data.summary.totalSuccess} records from ${data.summary.totalFiles} files.`,
          summary: data.summary
        });
        if (onSuccess) onSuccess();
      } else {
        setResult({ success: false, message: data.error || 'Failed to process files' });
      }
    } catch (error) {
      console.error('Error uploading training matrix:', error);
      setResult({ success: false, message: 'An unexpected error occurred during processing.' });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div 
        className="bg-[#0f0d1e] border border-indigo-500/20 rounded-[32px] w-full max-w-lg shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-teal-600 to-emerald-600 p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg backdrop-blur-md">
              <Files className="h-5 w-5 text-white" />
            </div>
            <h2 className="text-xl font-bold text-white tracking-tight">Bulk Upload Training Matrix</h2>
          </div>
          <button 
            onClick={onClose}
            className="p-1 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="h-6 w-6 text-white" />
          </button>
        </div>

        {/* Content */}
        <div className="p-8 space-y-6">
          <div 
            onClick={() => fileInputRef.current?.click()}
            className={`cursor-pointer border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center gap-4 transition-all ${
              files.length > 0 ? 'border-teal-500/40 bg-teal-500/5' : 'border-indigo-500/20 bg-indigo-500/5 hover:bg-indigo-500/10'
            }`}
          >
            {files.length > 0 ? (
              <>
                <div className="flex -space-x-4">
                  {files.slice(0, 3).map((_, i) => (
                    <div key={i} className="p-3 bg-teal-500/20 rounded-xl border border-teal-500/30 text-teal-400">
                      <FileText className="h-8 w-8" />
                    </div>
                  ))}
                  {files.length > 3 && (
                    <div className="p-3 bg-gray-800 rounded-xl border border-white/10 text-gray-400 flex items-center justify-center w-14 h-14 text-xs font-bold">
                      +{files.length - 3}
                    </div>
                  )}
                </div>
                <div className="text-center">
                  <p className="text-teal-400 font-bold text-sm">{files.length} Files Selected</p>
                  <p className="text-gray-500 text-xs mt-1">Ready for AI processing</p>
                </div>
              </>
            ) : (
              <>
                <div className="p-4 rounded-full bg-teal-500/10 text-teal-400">
                  <Upload className="h-8 w-8" />
                </div>
                <div className="text-center">
                  <p className="text-gray-300 font-bold text-sm text-teal-100">Click to select DOC files</p>
                  <p className="text-gray-500 text-xs mt-1">Bulk upload supported (.docx)</p>
                </div>
              </>
            )}
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileChange}
              accept=".docx"
              multiple
              className="hidden"
            />
          </div>

          <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
            <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />
              AI-Powered Extraction
            </h4>
            <p className="text-xs text-gray-500 leading-relaxed">
              Our system will automatically scan your DOC files, identify training tables, and extract employee names, SOP codes, and training dates using Gemini AI.
            </p>
          </div>

          {result && (
            <div className={`p-4 rounded-xl flex items-start gap-3 border ${
              result.success ? 'bg-teal-500/10 border-teal-500/20 text-teal-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
            }`}>
              {result.success ? <CheckCircle2 className="h-5 w-5 shrink-0" /> : <AlertCircle className="h-5 w-5 shrink-0" />}
              <div className="flex-1">
                <p className="text-xs font-bold mb-1">{result.success ? 'Success' : 'Processing Failed'}</p>
                <p className="text-[11px] font-medium leading-relaxed opacity-80">{result.message}</p>
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              className="flex-1 py-3.5 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white rounded-xl font-bold transition-all border border-white/5 uppercase tracking-widest text-[10px]"
            >
              Cancel
            </button>
            <button
              disabled={files.length === 0 || uploading}
              onClick={handleUpload}
              className="flex-1 py-3.5 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white rounded-xl font-bold transition-all shadow-lg shadow-teal-500/20 disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-widest text-[10px] flex items-center justify-center gap-2"
            >
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  AI Scanning...
                </>
              ) : (
                'Start Bulk Process'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
