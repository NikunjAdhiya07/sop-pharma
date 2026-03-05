'use client';

import React, { useState, useRef, useEffect } from 'react';
import { X, Upload, FileText, Loader2, CheckCircle2, AlertCircle, Users, Save, Plus, Trash2, Eye, RefreshCw } from 'lucide-react';
import * as XLSX from 'xlsx';

interface TrainerUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface TrainerEntry {
  departmentName: string;
  trainerName: string;
}

interface PreviewRow {
  [key: string]: string;
}

export default function TrainerUploadModal({ isOpen, onClose, onSuccess }: TrainerUploadModalProps) {
  const [activeTab, setActiveTab] = useState<'manual' | 'upload'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Preview state
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [availableColumns, setAvailableColumns] = useState<string[]>([]);
  const [deptCol, setDeptCol] = useState('');
  const [trainerCol, setTrainerCol] = useState('');
  const [sopCol, setSopCol] = useState('');
  const [showPreview, setShowPreview] = useState(false);

  // Manual entry state
  const [entries, setEntries] = useState<TrainerEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(false);

  const DEFAULT_DEPARTMENTS = [
    'QC', 'QA', 'Production', 'Microbiology', 'Engineering and Maintenance',
    'Store', 'Personnel',
  ];

  useEffect(() => {
    if (isOpen) {
      loadExistingTrainers();
    }
  }, [isOpen]);

  const loadExistingTrainers = async () => {
    setLoadingExisting(true);
    try {
      const res = await fetch('/api/departments/trainers');
      const data = await res.json();
      if (data.success && data.trainers.length > 0) {
        setEntries(data.trainers.map((t: any) => ({
          departmentName: t.departmentName,
          trainerName: t.trainerName
        })));
      } else {
        setEntries(DEFAULT_DEPARTMENTS.map(d => ({ departmentName: d, trainerName: '' })));
      }
    } catch (e) {
      setEntries(DEFAULT_DEPARTMENTS.map(d => ({ departmentName: d, trainerName: '' })));
    } finally {
      setLoadingExisting(false);
    }
  };

  if (!isOpen) return null;

  /** Parse the Excel/CSV client-side for preview */
  const parseFileForPreview = async (f: File) => {
    const buf = await f.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' }) as PreviewRow[];

    if (rows.length === 0) return;

    const cols = Object.keys(rows[0]);
    setAvailableColumns(cols);
    setPreviewRows(rows.slice(0, 6)); // Show up to 6 preview rows

    // Auto-detect likely columns
    const autoMatch = (candidates: string[]) =>
      cols.find(c => candidates.some(cand => c.toLowerCase().includes(cand.toLowerCase()))) || '';

    setDeptCol(autoMatch(['department', 'dept']));
    setTrainerCol(autoMatch(['trainer', 'training officer', 'training incharge', 'incharge']));
    setSopCol(autoMatch(['sop', 'protocol', 'identifier', 'code']));
    setShowPreview(true);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const f = e.target.files[0];
      setFile(f);
      setResult(null);
      setShowPreview(false);
      await parseFileForPreview(f);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f && (f.name.endsWith('.xlsx') || f.name.endsWith('.xls') || f.name.endsWith('.csv'))) {
      setFile(f);
      setResult(null);
      setShowPreview(false);
      await parseFileForPreview(f);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setResult(null);

    const formData = new FormData();
    formData.append('file', file);
    if (deptCol) formData.append('deptCol', deptCol);
    if (trainerCol) formData.append('trainerCol', trainerCol);
    if (sopCol) formData.append('sopCol', sopCol);

    try {
      const response = await fetch('/api/departments/trainers', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (data.success) {
        setResult({ success: true, message: data.message });
        setTimeout(() => {
          onSuccess();
          onClose();
        }, 2000);
      } else {
        setResult({ success: false, message: data.error || 'Failed to upload file' });
      }
    } catch (error) {
      setResult({ success: false, message: 'An unexpected error occurred' });
    } finally {
      setUploading(false);
    }
  };

  const handleSaveAll = async () => {
    const validEntries = entries.filter(e => e.departmentName.trim() && e.trainerName.trim());
    if (validEntries.length === 0) {
      setResult({ success: false, message: 'Please enter at least one trainer name' });
      return;
    }

    setSaving(true);
    setResult(null);
    let savedCount = 0;

    try {
      for (const entry of validEntries) {
        const res = await fetch('/api/departments/trainers', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(entry)
        });
        const data = await res.json();
        if (data.success) savedCount++;
      }

      setResult({ success: true, message: `Successfully saved ${savedCount} trainer assignments!` });
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 2000);
    } catch (error) {
      setResult({ success: false, message: 'Failed to save trainer assignments' });
    } finally {
      setSaving(false);
    }
  };

  const updateEntry = (index: number, field: 'departmentName' | 'trainerName', value: string) => {
    setEntries(prev => prev.map((e, i) => i === index ? { ...e, [field]: value } : e));
  };

  const addEntry = () => {
    setEntries(prev => [...prev, { departmentName: '', trainerName: '' }]);
  };

  const removeEntry = (index: number) => {
    setEntries(prev => prev.filter((_, i) => i !== index));
  };

  const ColSelect = ({ value, onChange, label, optional }: { value: string; onChange: (v: string) => void; label: string; optional?: boolean }) => (
    <div className="space-y-1.5">
      <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-1">
        {label}
        {optional && <span className="text-gray-600 normal-case font-normal">(optional)</span>}
      </label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:ring-2 ring-indigo-500/50 outline-none cursor-pointer"
      >
        <option value="">— Not mapped —</option>
        {availableColumns.map(col => (
          <option key={col} value={col}>{col}</option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div 
        className="bg-[#0f0d1e] border border-indigo-500/20 rounded-[32px] w-full max-w-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-6 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg backdrop-blur-md">
              <Users className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">Assign Trainers</h2>
              <p className="text-white/60 text-[10px] font-medium mt-0.5">Upload your Excel file or enter manually</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="h-6 w-6 text-white" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-white/5 shrink-0">
          <button
            onClick={() => setActiveTab('upload')}
            className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest transition-all ${
              activeTab === 'upload' 
                ? 'text-indigo-400 border-b-2 border-indigo-500 bg-indigo-500/5' 
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            📁 Upload Excel
          </button>
          <button
            onClick={() => setActiveTab('manual')}
            className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest transition-all ${
              activeTab === 'manual' 
                ? 'text-indigo-400 border-b-2 border-indigo-500 bg-indigo-500/5' 
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            👤 Manual Entry
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {activeTab === 'upload' ? (
            <>
              {/* Drop Zone */}
              <div 
                onClick={() => fileInputRef.current?.click()}
                onDrop={handleDrop}
                onDragOver={e => e.preventDefault()}
                className={`cursor-pointer border-2 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center gap-3 transition-all ${
                  file ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-indigo-500/20 bg-indigo-500/5 hover:bg-indigo-500/10 hover:border-indigo-500/40'
                }`}
              >
                {file ? (
                  <>
                    <FileText className="h-10 w-10 text-emerald-400" />
                    <div className="text-center">
                      <p className="text-emerald-400 font-bold text-sm truncate max-w-[280px]">{file.name}</p>
                      <p className="text-gray-500 text-xs mt-0.5">{(file.size / 1024).toFixed(1)} KB — {previewRows.length > 0 ? `${previewRows.length} preview rows loaded` : 'parsing...'}</p>
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); setFile(null); setShowPreview(false); setResult(null); }}
                      className="text-[10px] font-bold text-gray-500 hover:text-rose-400 uppercase tracking-wide transition-colors flex items-center gap-1"
                    >
                      <RefreshCw className="h-3 w-3" /> Choose different file
                    </button>
                  </>
                ) : (
                  <>
                    <div className="p-4 rounded-full bg-indigo-500/10 text-indigo-400">
                      <Upload className="h-8 w-8" />
                    </div>
                    <div className="text-center">
                      <p className="text-white font-bold text-sm">Drop your Excel file here</p>
                      <p className="text-gray-500 text-xs mt-1">or click to browse — .xlsx, .xls, .csv supported</p>
                    </div>
                  </>
                )}
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileChange}
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                />
              </div>

              {/* Column Mapping (shown after file is parsed) */}
              {showPreview && availableColumns.length > 0 && (
                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  {/* Column mapping */}
                  <div className="bg-white/[0.03] rounded-2xl border border-white/5 p-4 space-y-3">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_8px_#6366f1]" />
                      <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Map Your Columns</h4>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <ColSelect value={deptCol} onChange={setDeptCol} label="Department Column" optional />
                      <ColSelect value={trainerCol} onChange={setTrainerCol} label="Trainer Column" />
                      <ColSelect value={sopCol} onChange={setSopCol} label="SOP Code Column" optional />
                    </div>
                    <p className="text-[10px] text-gray-600">
                      💡 Map <strong className="text-gray-400">Trainer Column</strong> (required) + at least one of Department or SOP Code.
                    </p>
                  </div>

                  {/* Data preview */}
                  <div className="bg-white/[0.03] rounded-2xl border border-white/5 overflow-hidden">
                    <div className="px-4 py-3 border-b border-white/5 flex items-center gap-2">
                      <Eye className="h-3.5 w-3.5 text-indigo-400" />
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Data Preview (first {previewRows.length} rows)</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-white/5">
                            {availableColumns.map(col => (
                              <th key={col} className={`px-3 py-2 text-left font-black uppercase tracking-wide whitespace-nowrap ${
                                col === trainerCol ? 'text-indigo-400' :
                                col === deptCol ? 'text-purple-400' :
                                col === sopCol ? 'text-amber-400' :
                                'text-gray-600'
                              }`}>
                                {col === trainerCol ? '🏷 ' : col === deptCol ? '🏢 ' : col === sopCol ? '📄 ' : ''}
                                {col}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {previewRows.map((row, i) => (
                            <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                              {availableColumns.map(col => (
                                <td key={col} className={`px-3 py-2 whitespace-nowrap ${
                                  col === trainerCol ? 'text-indigo-300 font-medium' :
                                  col === deptCol ? 'text-purple-300' :
                                  col === sopCol ? 'text-amber-300' :
                                  'text-gray-500'
                                }`}>
                                  {row[col]?.toString() || '—'}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Manual Entry Form */}
              {loadingExisting ? (
                <div className="flex items-center justify-center py-8 gap-3 text-gray-500">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="text-sm font-medium">Loading departments...</span>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-[1fr_1fr_32px] gap-2 pb-1">
                    <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest px-1">Department</span>
                    <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest px-1">Trainer Name</span>
                    <span />
                  </div>
                  {entries.map((entry, idx) => (
                    <div key={idx} className="grid grid-cols-[1fr_1fr_32px] gap-2 items-center animate-in fade-in slide-in-from-top-1 duration-200">
                      <input
                        type="text"
                        value={entry.departmentName}
                        onChange={e => updateEntry(idx, 'departmentName', e.target.value)}
                        placeholder="e.g. QC"
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-xs font-bold text-white placeholder-gray-600 focus:ring-2 ring-indigo-500/50 outline-none"
                      />
                      <input
                        type="text"
                        value={entry.trainerName}
                        onChange={e => updateEntry(idx, 'trainerName', e.target.value)}
                        placeholder="Trainer name..."
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-xs font-bold text-white placeholder-gray-600 focus:ring-2 ring-indigo-500/50 outline-none"
                      />
                      <button
                        onClick={() => removeEntry(idx)}
                        className="p-1.5 text-gray-600 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={addEntry}
                    className="w-full py-2 border border-dashed border-white/10 rounded-xl text-[10px] font-bold text-gray-500 hover:text-indigo-400 hover:border-indigo-500/30 transition-all flex items-center justify-center gap-2"
                  >
                    <Plus className="h-3 w-3" />
                    Add Row
                  </button>
                </div>
              )}
            </>
          )}

          {result && (
            <div className={`p-4 rounded-xl flex items-start gap-3 border ${
              result.success ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
            }`}>
              {result.success ? <CheckCircle2 className="h-5 w-5 shrink-0" /> : <AlertCircle className="h-5 w-5 shrink-0" />}
              <p className="text-xs font-semibold leading-relaxed">{result.message}</p>
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
          {activeTab === 'manual' ? (
            <button
              disabled={saving || entries.filter(e => e.trainerName.trim()).length === 0}
              onClick={handleSaveAll}
              className="flex-1 py-3.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-xl font-bold transition-all shadow-lg shadow-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-widest text-[10px] flex items-center justify-center gap-2"
            >
              {saving ? (
                <><Loader2 className="h-4 w-4 animate-spin" />Saving...</>
              ) : (
                <><Save className="h-4 w-4" />Save Trainers</>
              )}
            </button>
          ) : (
            <button
              disabled={!file || uploading || !trainerCol || (!deptCol && !sopCol)}
              onClick={handleUpload}
              className="flex-1 py-3.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-xl font-bold transition-all shadow-lg shadow-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-widest text-[10px] flex items-center justify-center gap-2"
              title={!trainerCol ? 'Select the trainer column first' : (!deptCol && !sopCol) ? 'Select department or SOP column' : ''}
            >
              {uploading ? (
                <><Loader2 className="h-4 w-4 animate-spin" />Saving...</>
              ) : (
                <><Upload className="h-4 w-4" />Import & Save</>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
