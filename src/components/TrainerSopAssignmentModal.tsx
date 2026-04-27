'use client';

import React, { useState, useRef } from 'react';
import {
  X, Upload, FileText, Loader2, CheckCircle2, AlertCircle,
  BookOpen, User, RefreshCw, ChevronDown, ChevronUp, ArrowRight
} from 'lucide-react';

interface TrainerSopAssignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface SheetPreview {
  department: string;
  sopCount: number;
  trainerNames: string[];
}

interface Preview {
  totalSheets: number;
  totalRows: number;
  totalTrainers: number;
  sheetSummary: Record<string, SheetPreview>;
  warnings: string[];
}

interface ImportSummary {
  totalTrainers: number;
  matched: number;
  unmatched: string[];
  assignments: { trainerName: string; sopCount: number; sops: { code: string; name: string }[] }[];
}

type Step = 'upload' | 'preview' | 'done';

export default function TrainerSopAssignmentModal({
  isOpen,
  onClose,
  onSuccess,
}: TrainerSopAssignmentModalProps) {
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<'append' | 'replace'>('append');
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [expandedTrainer, setExpandedTrainer] = useState<string | null>(null);
  const [expandedSheet, setExpandedSheet] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const reset = () => {
    setStep('upload');
    setFile(null);
    setPreview(null);
    setSummary(null);
    setWarnings([]);
    setError(null);
    setExpandedTrainer(null);
    setExpandedSheet(null);
  };

  const handleFile = async (f: File) => {
    setFile(f);
    setError(null);
    setLoading(true);

    const fd = new FormData();
    fd.append('file', f);
    fd.append('previewOnly', 'true');

    try {
      const res = await fetch('/api/admin/trainer-assignment', { method: 'POST', body: fd });
      const data = await res.json();

      if (data.success) {
        setPreview(data.preview);
        setWarnings(data.preview.warnings ?? []);
        setStep('preview');
      } else {
        setError(data.error || 'Failed to parse file');
      }
    } catch {
      setError('Unexpected error while reading file');
    } finally {
      setLoading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f && /\.(xlsx|xls|csv)$/i.test(f.name)) handleFile(f);
  };

  const handleImport = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);

    const fd = new FormData();
    fd.append('file', file);
    fd.append('mode', mode);

    try {
      const res = await fetch('/api/admin/trainer-assignment', { method: 'POST', body: fd });
      const data = await res.json();

      if (data.success) {
        setSummary(data.summary);
        setWarnings(data.warnings ?? []);
        setStep('done');
        onSuccess();
      } else {
        setError(data.error || 'Import failed');
      }
    } catch {
      setError('Unexpected error during import');
    } finally {
      setLoading(false);
    }
  };

  const deptColor = (dept: string) => {
    const map: Record<string, string> = {
      QA: 'text-purple-300 bg-purple-500/10 border-purple-500/20',
      QC: 'text-blue-300 bg-blue-500/10 border-blue-500/20',
      Microbiology: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20',
      Production: 'text-orange-300 bg-orange-500/10 border-orange-500/20',
      'Engineering and Maintenance': 'text-yellow-300 bg-yellow-500/10 border-yellow-500/20',
      Store: 'text-teal-300 bg-teal-500/10 border-teal-500/20',
      Personnel: 'text-pink-300 bg-pink-500/10 border-pink-500/20',
    };
    return map[dept] ?? 'text-gray-300 bg-gray-500/10 border-gray-500/20';
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div
        className="bg-[#0f0d1e] border border-indigo-500/20 rounded-[28px] w-full max-w-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-violet-600 p-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg">
              <BookOpen className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">SOP-wise Trainer Assignment</h2>
              <p className="text-white/60 text-[10px] mt-0.5">
                {step === 'upload' && 'Upload the "SOP-wise Trainer List" Excel file'}
                {step === 'preview' && `${preview?.totalSheets} sheets detected — review and confirm`}
                {step === 'done' && 'Import complete'}
              </p>
            </div>
          </div>
          <button onClick={() => { reset(); onClose(); }} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors">
            <X className="h-5 w-5 text-white" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex border-b border-white/5 shrink-0">
          {(['upload', 'preview', 'done'] as Step[]).map((s, i) => (
            <div
              key={s}
              className={`flex-1 py-2.5 text-center text-[10px] font-black uppercase tracking-widest transition-all ${
                step === s
                  ? 'text-indigo-400 border-b-2 border-indigo-500 bg-indigo-500/5'
                  : (step as string) === 'done'
                    ? 'text-gray-500'
                    : 'text-gray-600'
              }`}
            >
              {i + 1}. {s}
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1">

          {/* ── STEP 1: UPLOAD ─────────────────────────────────────────── */}
          {step === 'upload' && (
            <>
              <div className="bg-indigo-500/5 border border-indigo-500/15 rounded-xl p-3 text-[10px] text-gray-400 leading-relaxed">
                <span className="text-indigo-400 font-bold">Expected file: </span>
                &quot;SOP-wise Trainer List.xlsx&quot; with multiple sheets (one per department/group).
                Each sheet should have <span className="text-amber-300">SOP SUBJECT</span>,{' '}
                <span className="text-emerald-300">SOP NO.</span>, and{' '}
                <span className="text-indigo-300">Trainer Name</span> columns.
              </div>

              <div
                onClick={() => !loading && fileInputRef.current?.click()}
                onDrop={handleDrop}
                onDragOver={e => e.preventDefault()}
                className={`cursor-pointer border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center gap-4 transition-all ${
                  loading
                    ? 'border-indigo-500/30 bg-indigo-500/5 cursor-wait'
                    : 'border-indigo-500/20 bg-indigo-500/5 hover:bg-indigo-500/10 hover:border-indigo-500/40'
                }`}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-10 w-10 text-indigo-400 animate-spin" />
                    <p className="text-indigo-300 font-bold text-sm">Reading all sheets…</p>
                  </>
                ) : (
                  <>
                    <div className="p-4 rounded-full bg-indigo-500/10 text-indigo-400">
                      <Upload className="h-8 w-8" />
                    </div>
                    <div className="text-center">
                      <p className="text-white font-bold text-sm">Drop your Excel file here</p>
                      <p className="text-gray-500 text-xs mt-1">.xlsx, .xls, .csv — all sheets will be read automatically</p>
                    </div>
                  </>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                  className="hidden"
                />
              </div>

              {error && (
                <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-rose-300">{error}</p>
                </div>
              )}
            </>
          )}

          {/* ── STEP 2: PREVIEW ────────────────────────────────────────── */}
          {step === 'preview' && preview && (
            <>
              {/* Summary stats */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Sheets', value: preview.totalSheets, color: 'indigo' },
                  { label: 'SOP Rows', value: preview.totalRows, color: 'emerald' },
                  { label: 'Trainers', value: preview.totalTrainers, color: 'amber' },
                ].map(stat => (
                  <div
                    key={stat.label}
                    className={`bg-${stat.color}-500/5 border border-${stat.color}-500/20 rounded-xl p-3 text-center`}
                  >
                    <p className={`text-2xl font-black text-${stat.color}-300`}>{stat.value}</p>
                    <p className="text-[10px] text-gray-500 uppercase tracking-widest mt-0.5">{stat.label}</p>
                  </div>
                ))}
              </div>

              {/* Sheets breakdown */}
              <div className="bg-white/[0.03] rounded-2xl border border-white/5 overflow-hidden">
                <div className="px-4 py-2.5 border-b border-white/5">
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Sheets Detected</span>
                </div>
                <div className="max-h-56 overflow-y-auto divide-y divide-white/5">
                  {Object.entries(preview.sheetSummary).map(([sheet, info]) => (
                    <div key={sheet}>
                      <button
                        onClick={() => setExpandedSheet(expandedSheet === sheet ? null : sheet)}
                        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-white/[0.02] transition-colors text-left"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${deptColor(info.department)}`}>
                            {info.department}
                          </span>
                          <span className="text-xs text-gray-300 font-medium truncate">{sheet}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          <span className="text-[10px] text-emerald-400 font-bold">{info.sopCount} SOPs</span>
                          {expandedSheet === sheet
                            ? <ChevronUp className="h-3.5 w-3.5 text-gray-500" />
                            : <ChevronDown className="h-3.5 w-3.5 text-gray-500" />}
                        </div>
                      </button>
                      {expandedSheet === sheet && (
                        <div className="px-4 pb-3 bg-white/[0.01]">
                          <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1.5">Trainers in this sheet</p>
                          <div className="flex flex-wrap gap-1.5">
                            {info.trainerNames.map(t => (
                              <span key={t} className="flex items-center gap-1 bg-amber-500/10 border border-amber-500/20 text-amber-300 rounded-lg px-2 py-1 text-[10px] font-bold">
                                <User className="h-2.5 w-2.5" /> {t}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Warnings */}
              {warnings.length > 0 && (
                <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3 space-y-1">
                  <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest mb-2">Warnings</p>
                  {warnings.map((w, i) => (
                    <p key={i} className="text-[10px] text-amber-300 flex items-start gap-1.5">
                      <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" /> {w}
                    </p>
                  ))}
                </div>
              )}

              {/* Import mode */}
              <div className="bg-white/[0.03] rounded-2xl border border-white/5 p-4">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Import Mode</p>
                <div className="flex gap-3">
                  {(['append', 'replace'] as const).map(m => (
                    <button
                      key={m}
                      onClick={() => setMode(m)}
                      className={`flex-1 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wide transition-all border ${
                        mode === m
                          ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-500/20'
                          : 'bg-white/5 border-white/10 text-gray-400 hover:text-white hover:bg-white/10'
                      }`}
                    >
                      {m === 'append' ? '➕ Append' : '🔄 Replace all'}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-gray-600 mt-2">
                  {mode === 'replace'
                    ? 'Existing SOP assignments for all users will be cleared first.'
                    : 'New SOPs will be added without removing existing assignments.'}
                </p>
              </div>

              {error && (
                <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-rose-300">{error}</p>
                </div>
              )}
            </>
          )}

          {/* ── STEP 3: DONE ──────────────────────────────────────────── */}
          {step === 'done' && summary && (
            <>
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 flex items-center gap-3">
                <CheckCircle2 className="h-6 w-6 text-emerald-400 shrink-0" />
                <div>
                  <p className="text-sm font-bold text-emerald-300">Import successful</p>
                  <p className="text-[10px] text-emerald-400/70 mt-0.5">
                    {summary.matched} of {summary.totalTrainers} trainers matched and assigned.
                    {summary.unmatched.length > 0 && ` ${summary.unmatched.length} unmatched.`}
                  </p>
                </div>
              </div>

              {/* Assignments list */}
              {summary.assignments.length > 0 && (
                <div className="bg-white/[0.03] rounded-2xl border border-white/5 overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-white/5">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                      Assignments ({summary.assignments.length})
                    </span>
                  </div>
                  <div className="max-h-64 overflow-y-auto divide-y divide-white/5">
                    {summary.assignments.map((a) => (
                      <div key={a.trainerName}>
                        <button
                          onClick={() => setExpandedTrainer(expandedTrainer === a.trainerName ? null : a.trainerName)}
                          className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-white/[0.02] transition-colors text-left"
                        >
                          <div className="flex items-center gap-2">
                            <User className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                            <span className="text-xs font-bold text-white">{a.trainerName}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-emerald-400 font-bold">{a.sopCount} SOPs</span>
                            {expandedTrainer === a.trainerName
                              ? <ChevronUp className="h-3.5 w-3.5 text-gray-500" />
                              : <ChevronDown className="h-3.5 w-3.5 text-gray-500" />}
                          </div>
                        </button>
                        {expandedTrainer === a.trainerName && (
                          <div className="px-4 pb-3 bg-white/[0.01] space-y-1">
                            {a.sops.map(s => (
                              <div key={s.code} className="flex items-start gap-2">
                                <span className="bg-indigo-500/15 border border-indigo-500/25 text-indigo-300 rounded px-1.5 py-0.5 text-[10px] font-bold shrink-0">
                                  {s.code}
                                </span>
                                <span className="text-[10px] text-gray-400 leading-tight">{s.name}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Unmatched */}
              {summary.unmatched.length > 0 && (
                <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3 space-y-1.5">
                  <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest">
                    Unmatched Trainer Names ({summary.unmatched.length})
                  </p>
                  {summary.unmatched.map((name, i) => (
                    <p key={i} className="text-[10px] text-amber-300 flex items-center gap-1.5">
                      <AlertCircle className="h-3 w-3 shrink-0" /> {name}
                    </p>
                  ))}
                  <p className="text-[10px] text-gray-600 mt-1">
                    Create user accounts with these exact names to enable automatic matching.
                  </p>
                </div>
              )}

              {warnings.length > 0 && (
                <div className="bg-white/[0.02] border border-white/5 rounded-xl p-3 space-y-1">
                  {warnings.map((w, i) => (
                    <p key={i} className="text-[10px] text-gray-500 flex items-start gap-1.5">
                      <AlertCircle className="h-3 w-3 mt-0.5 shrink-0 text-gray-600" /> {w}
                    </p>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 pt-0 flex gap-3 shrink-0">
          {step === 'done' ? (
            <button
              onClick={() => { reset(); onClose(); }}
              className="flex-1 py-3.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white rounded-xl font-bold transition-all shadow-lg shadow-indigo-500/20 uppercase tracking-widest text-[10px]"
            >
              Done
            </button>
          ) : (
            <>
              <button
                onClick={() => { if (step === 'preview') { reset(); } else { reset(); onClose(); } }}
                className="flex-1 py-3.5 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white rounded-xl font-bold transition-all border border-white/5 uppercase tracking-widest text-[10px]"
              >
                {step === 'preview' ? 'Back' : 'Cancel'}
              </button>

              {step === 'preview' && (
                <button
                  disabled={loading}
                  onClick={handleImport}
                  className="flex-1 py-3.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white rounded-xl font-bold transition-all shadow-lg shadow-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-widest text-[10px] flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Importing…</>
                  ) : (
                    <><ArrowRight className="h-4 w-4" /> Confirm Import</>
                  )}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
