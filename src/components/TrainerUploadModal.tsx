'use client';

import React, { useState, useRef, useEffect } from 'react';
import { X, Upload, FileText, Loader2, CheckCircle2, AlertCircle, Users, Save, Plus, Trash2 } from 'lucide-react';

interface TrainerUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface TrainerEntry {
  departmentName: string;
  trainerName: string;
}

export default function TrainerUploadModal({ isOpen, onClose, onSuccess }: TrainerUploadModalProps) {
  const [activeTab, setActiveTab] = useState<'manual' | 'upload'>('manual');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Manual entry state
  const [entries, setEntries] = useState<TrainerEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(false);

  // Available departments from training matrix
  const DEFAULT_DEPARTMENTS = [
    'QC', 'QA', 'Production', 'Microbiology', 'Engineering and Maintenance',
    'Store', 'Personnel', 'Quality Assurance', 'Quality Control'
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
        // Pre-fill with default departments (empty trainer names)
        setEntries(DEFAULT_DEPARTMENTS.map(d => ({ departmentName: d, trainerName: '' })));
      }
    } catch (e) {
      setEntries(DEFAULT_DEPARTMENTS.map(d => ({ departmentName: d, trainerName: '' })));
    } finally {
      setLoadingExisting(false);
    }
  };

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setResult(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setResult(null);

    const formData = new FormData();
    formData.append('file', file);

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

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div 
        className="bg-[#0f0d1e] border border-indigo-500/20 rounded-[32px] w-full max-w-lg shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-6 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg backdrop-blur-md">
              <Users className="h-5 w-5 text-white" />
            </div>
            <h2 className="text-xl font-bold text-white tracking-tight">Assign Trainers</h2>
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
            onClick={() => setActiveTab('manual')}
            className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest transition-all ${
              activeTab === 'manual' 
                ? 'text-indigo-400 border-b-2 border-indigo-500 bg-indigo-500/5' 
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            👤 Manual Entry
          </button>
          <button
            onClick={() => setActiveTab('upload')}
            className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest transition-all ${
              activeTab === 'upload' 
                ? 'text-indigo-400 border-b-2 border-indigo-500 bg-indigo-500/5' 
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            📁 File Upload
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {activeTab === 'manual' ? (
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
                    Add Department
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              {/* File Upload */}
              <div 
                onClick={() => fileInputRef.current?.click()}
                className={`cursor-pointer border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center gap-4 transition-all ${
                  file ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-indigo-500/20 bg-indigo-500/5 hover:bg-indigo-500/10'
                }`}
              >
                {file ? (
                  <>
                    <FileText className="h-12 w-12 text-emerald-400" />
                    <div className="text-center">
                      <p className="text-emerald-400 font-bold text-sm truncate max-w-[200px]">{file.name}</p>
                      <p className="text-gray-500 text-xs mt-1">{(file.size / 1024).toFixed(1)} KB</p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="p-4 rounded-full bg-indigo-500/10 text-indigo-400">
                      <Upload className="h-8 w-8" />
                    </div>
                    <div className="text-center">
                      <p className="text-gray-300 font-bold text-sm text-indigo-100">Click to select trainer file</p>
                      <p className="text-gray-500 text-xs mt-1">Excel (.xlsx) or CSV format</p>
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
              <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
                <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3">Required File Structure</h4>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-slate-900/50 p-2 rounded-lg border border-white/5">
                    <p className="text-[9px] text-gray-500 uppercase font-black">Column A</p>
                    <p className="text-xs text-indigo-300 font-bold">Department Name</p>
                  </div>
                  <div className="bg-slate-900/50 p-2 rounded-lg border border-white/5">
                    <p className="text-[9px] text-gray-500 uppercase font-black">Column B</p>
                    <p className="text-xs text-indigo-300 font-bold">Trainer Name</p>
                  </div>
                </div>
              </div>
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
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Save Trainers
                </>
              )}
            </button>
          ) : (
            <button
              disabled={!file || uploading}
              onClick={handleUpload}
              className="flex-1 py-3.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-xl font-bold transition-all shadow-lg shadow-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-widest text-[10px] flex items-center justify-center gap-2"
            >
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                'Upload & Assign'
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
