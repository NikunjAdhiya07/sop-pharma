'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { X, Upload, FileText, Loader2, CheckCircle, AlertCircle, FolderOpen, Languages } from 'lucide-react';

export type UploadSOPModalTab = 'english' | 'gujarati';

interface UploadSOPModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  /** Which bulk section to show when the modal opens */
  initialTab?: UploadSOPModalTab;
}

const ACCEPT = '.docx,.doc,.pdf';

export default function UploadSOPModal({ isOpen, onClose, onSuccess, initialTab = 'english' }: UploadSOPModalProps) {
  const [uploadTab, setUploadTab] = useState<UploadSOPModalTab>(initialTab);
  const [files, setFiles] = useState<File[]>([]);
  type BatchLanguage = 'English' | 'Gujarati' | 'auto';
  const [language, setLanguage] = useState<BatchLanguage>(initialTab === 'gujarati' ? 'Gujarati' : 'auto');
  const [department, setDepartment] = useState('');
  const [uploading, setUploading] = useState(false);
  /** One POST cannot hold thousands of files — same limit as structured folder upload. */
  const FILES_PER_CHUNK = 20;
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [result, setResult] = useState<{
    uploaded: number;
    failed: number;
    results: Array<{
      fileName: string;
      sopIdentifier: string;
      sopName: string;
      department: string;
      language?: 'English' | 'Gujarati';
    }>;
    errors: Array<{ fileName: string; error: string }>;
    storage: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const setFolderRef = useCallback((el: HTMLInputElement | null) => {
    folderInputRef.current = el;
    if (el) {
      el.setAttribute('webkitdirectory', '');
      el.setAttribute('directory', '');
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setUploadTab(initialTab);
    setLanguage(initialTab === 'gujarati' ? 'Gujarati' : 'auto');
    setFiles([]);
    setResult(null);
    setDepartment('');
  }, [isOpen, initialTab]);

  if (!isOpen) return null;

  const switchTab = (tab: UploadSOPModalTab) => {
    setUploadTab(tab);
    setLanguage(tab === 'gujarati' ? 'Gujarati' : 'auto');
    setResult(null);
  };

  const isDoc = (f: File) => {
    const base = f.name.replace(/^.*[/\\]/, '');
    if (base.startsWith('~$')) return false;
    return base.endsWith('.docx') || base.endsWith('.doc') || base.endsWith('.pdf');
  };

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const newFiles = Array.from(list).filter(isDoc);
    setFiles((prev) => {
      const keys = new Set(prev.map((f) => `${f.name}-${f.size}-${f.lastModified}`));
      const toAdd = newFiles.filter((f) => !keys.has(`${f.name}-${f.size}-${f.lastModified}`));
      return [...prev, ...toAdd];
    });
  };

  const addFilesFromList = (list: File[]) => {
    const allowed = list.filter(isDoc);
    setFiles((prev) => {
      const keys = new Set(prev.map((f) => `${f.name}-${f.size}-${f.lastModified}`));
      const toAdd = allowed.filter((f) => !keys.has(`${f.name}-${f.size}-${f.lastModified}`));
      return [...prev, ...toAdd];
    });
  };

  const readAllFilesFromDir = (dir: FileSystemDirectoryEntry): Promise<File[]> => {
    return new Promise((resolve, reject) => {
      const reader = dir.createReader();
      const acc: File[] = [];
      const readBatch = () => {
        reader.readEntries(
          async (entries) => {
            if (entries.length === 0) {
              resolve(acc);
              return;
            }
            for (const entry of entries) {
              if (entry.isFile) {
                await new Promise<void>((res) => {
                  (entry as FileSystemFileEntry).file((f) => {
                    acc.push(f);
                    res();
                  }, res);
                });
              } else if (entry.isDirectory) {
                const sub = await readAllFilesFromDir(entry as FileSystemDirectoryEntry);
                acc.push(...sub);
              }
            }
            readBatch();
          },
          (err) => reject(err)
        );
      };
      readBatch();
    });
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const items = e.dataTransfer.items;
    if (!items?.length) return;
    const dirPromises: Promise<File[]>[] = [];
    const directFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const entry = items[i].webkitGetAsEntry?.();
      if (entry?.isDirectory) {
        dirPromises.push(readAllFilesFromDir(entry as FileSystemDirectoryEntry));
      } else {
        const f = items[i].getAsFile();
        if (f) directFiles.push(f);
      }
    }
    if (directFiles.length) addFilesFromList(directFiles);
    if (dirPromises.length) {
      try {
        const dirFiles = (await Promise.all(dirPromises)).flat();
        addFilesFromList(dirFiles);
      } catch (err) {
        console.error('Reading dropped folder(s):', err);
        alert('Could not read one or more folders. Try selecting the parent folder that contains all department folders (e.g. the folder containing 1. QA, 2. QC, etc.) using "Select folder".');
      }
    }
  };

  const clearAll = () => setFiles([]);

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (files.length === 0) {
      alert('Please select at least one DOCX or PDF file.');
      return;
    }
    setUploading(true);
    setResult(null);
    setUploadProgress(null);
    const totalChunks = Math.ceil(files.length / FILES_PER_CHUNK);
    const allResults: Array<{
      fileName: string;
      sopId: string;
      sopIdentifier: string;
      sopName: string;
      department: string;
      language?: 'English' | 'Gujarati';
    }> = [];
    const allErrors: Array<{ fileName: string; error: string }> = [];
    let storageLabel = 'local';
    let totalUploaded = 0;
    let totalFailed = 0;

    try {
      for (let c = 0; c < totalChunks; c++) {
        const slice = files.slice(c * FILES_PER_CHUNK, (c + 1) * FILES_PER_CHUNK);
        const formData = new FormData();
        formData.append('language', language);
        if (department.trim()) formData.append('department', department.trim());
        formData.append(
          'relativePaths',
          JSON.stringify(
            slice.map((f) => (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name),
          ),
        );
        slice.forEach((f) => formData.append('files', f));

        setUploadProgress({ done: c, total: totalChunks });

        let res: Response;
        try {
          res = await fetch('/api/sop/upload-batch', { method: 'POST', body: formData });
        } catch (netErr) {
          const msg = netErr instanceof Error ? netErr.message : 'Network error';
          for (const f of slice) {
            allErrors.push({ fileName: f.name, error: `${msg} (batch ${c + 1}/${totalChunks})` });
          }
          totalFailed += slice.length;
          continue;
        }

        const text = await res.text();
        let data: {
          success?: boolean;
          error?: string;
          details?: string;
          uploaded?: number;
          failed?: number;
          results?: typeof allResults;
          errors?: typeof allErrors;
          storage?: string;
        };
        try {
          data = JSON.parse(text) as typeof data;
        } catch {
          const hint = text.slice(0, 200);
          for (const f of slice) {
            allErrors.push({
              fileName: f.name,
              error: `Invalid server response (batch ${c + 1}/${totalChunks}): ${hint || res.status}`,
            });
          }
          totalFailed += slice.length;
          continue;
        }

        if (data.storage) storageLabel = data.storage;

        if (!res.ok || data.success === false) {
          const msg = data.error || data.details || `HTTP ${res.status}`;
          if (Array.isArray(data.errors) && data.errors.length > 0) {
            allErrors.push(...data.errors);
            totalFailed += data.failed ?? data.errors.length;
          } else {
            for (const f of slice) {
              allErrors.push({ fileName: f.name, error: `${msg} (batch ${c + 1}/${totalChunks})` });
            }
            totalFailed += slice.length;
          }
          continue;
        }

        totalUploaded += data.uploaded ?? 0;
        totalFailed += data.failed ?? 0;
        if (Array.isArray(data.results)) allResults.push(...data.results);
        if (Array.isArray(data.errors)) allErrors.push(...data.errors);

        setUploadProgress({ done: c + 1, total: totalChunks });
      }

      setResult({
        uploaded: totalUploaded,
        failed: totalFailed,
        results: allResults,
        errors: allErrors,
        storage: storageLabel,
      });
      if (totalUploaded > 0) onSuccess();
    } catch (err) {
      setResult({
        uploaded: totalUploaded,
        failed: Math.max(totalFailed, files.length - totalUploaded),
        results: allResults,
        errors: [
          ...allErrors,
          { fileName: '', error: err instanceof Error ? err.message : 'Upload failed' },
        ],
        storage: storageLabel,
      });
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  };

  const resetAndClose = () => {
    setFiles([]);
    setResult(null);
    setDepartment('');
    setUploadTab(initialTab);
    setLanguage(initialTab === 'gujarati' ? 'Gujarati' : 'auto');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-xl shadow-xl max-w-xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <h2 className="text-base font-bold text-gray-800 flex items-center gap-2">
            <Upload className="h-4 w-4 text-purple-600" />
            Bulk upload SOP
          </h2>
          <button
            type="button"
            onClick={resetAndClose}
            className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="px-4 pt-2 pb-0 border-b border-gray-100">
            <div className="flex rounded-lg bg-gray-100 p-0.5 gap-0.5">
              <button
                type="button"
                onClick={() => switchTab('english')}
                className={`flex-1 rounded-md px-3 py-2 text-xs font-semibold transition-colors ${
                  uploadTab === 'english'
                    ? 'bg-white text-purple-700 shadow-sm'
                    : 'text-gray-600 hover:text-gray-800'
                }`}>
                English bulk folders
              </button>
              <button
                type="button"
                onClick={() => switchTab('gujarati')}
                className={`flex-1 rounded-md px-3 py-2 text-xs font-semibold transition-colors flex items-center justify-center gap-1 ${
                  uploadTab === 'gujarati'
                    ? 'bg-white text-indigo-800 shadow-sm border border-indigo-100'
                    : 'text-gray-600 hover:text-gray-800'
                }`}>
                <Languages className="h-3.5 w-3.5 shrink-0" />
                Gujarati bulk folders
              </button>
            </div>
          </div>

          <div className="px-4 py-3 space-y-3 overflow-y-auto">
            {uploadTab === 'gujarati' ? (
              <div className="rounded-lg border border-indigo-200 bg-indigo-50/80 px-3 py-2.5 space-y-1.5">
                <p className="text-xs font-bold text-indigo-900">Bulk Gujarati SOP folders</p>
                <p className="text-[11px] text-indigo-900/90 leading-relaxed">
                  Use the <strong>same folder layout as English</strong> (department folders → SOP folders → main DOCX/PDF).
                  Files are saved as <strong>language: Gujarati</strong> and matched to SOP codes in file names. After upload, the dashboard will show separate GUJ links when the Gujarati path differs from the English file.
                </p>
              </div>
            ) : null}

            <p className="text-xs text-gray-600">
              To upload all department folders (e.g. 1. QA, 2. QC, Store, …): <strong>drag &amp; drop all folders at once</strong> onto the box below, or select the parent folder, or click &quot;Select folder&quot; repeatedly to add folders one by one. Metadata is extracted automatically.
              {uploadTab === 'english' && language === 'auto' ? (
                <span className="block mt-1 text-[11px] text-purple-800/90">
                  <strong>Auto language</strong> uses Gujarati script in the file or path (e.g. a <code className="text-[10px] bg-purple-100 px-0.5 rounded">Gujarati SOP</code> folder) to tag records as Gujarati; everything else defaults to English.
                </span>
              ) : null}
            </p>

            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT}
              multiple
              className="hidden"
              onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }}
            />
            <input
              ref={setFolderRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }}
            />

            <div
              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              className={`rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors ${
                dragActive
                  ? uploadTab === 'gujarati'
                    ? 'border-indigo-500 bg-indigo-50'
                    : 'border-purple-500 bg-purple-50'
                  : uploadTab === 'gujarati'
                    ? 'border-indigo-200 bg-indigo-50/40 hover:border-indigo-400 hover:bg-indigo-50'
                    : 'border-gray-300 bg-gray-50 hover:border-purple-300 hover:bg-purple-50/50'
              }`}
            >
              <Upload className={`h-8 w-8 mx-auto mb-2 ${uploadTab === 'gujarati' ? 'text-indigo-600' : 'text-purple-500'}`} />
              <p className="text-xs font-medium text-gray-700 mb-1">Drag all department folders here at once (supports multiple), or</p>
              <div className="flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-700"
                >
                  Select files
                </button>
                <button
                  type="button"
                  onClick={() => folderInputRef.current?.click()}
                  title="Select a folder — click again to add more folders"
                  className="rounded-lg border border-gray-400 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 flex items-center gap-1"
                >
                  <FolderOpen className="h-3.5 w-3.5" /> Select folder
                </button>
              </div>
              <p className="text-[10px] text-gray-500 mt-2">
                Tip: Select the parent folder containing all dept folders, or click &quot;Select folder&quot; multiple times to add folders one by one
              </p>
            </div>

            <div className="flex gap-3 flex-wrap items-center">
              <label className="flex items-center gap-2 text-xs">
                <span className="text-gray-600">Language (batch):</span>
                <select
                  value={language}
                  onChange={(e) => {
                    const v = e.target.value as BatchLanguage;
                    setLanguage(v);
                    if (v === 'Gujarati') setUploadTab('gujarati');
                    else if (v === 'English' || v === 'auto') setUploadTab('english');
                  }}
                  className="rounded border border-gray-300 text-gray-800"
                >
                  <option value="auto">Auto (detect per file)</option>
                  <option value="English">English (whole batch)</option>
                  <option value="Gujarati">Gujarati (whole batch)</option>
                </select>
              </label>
              <span className="text-[10px] text-gray-500">
                {language === 'auto'
                  ? 'Each file: Gujarati script, Gujarati SOP folder path, or Gujarati-heavy text → Gujarati; else English.'
                  : uploadTab === 'gujarati'
                    ? 'This batch is uploaded as Gujarati SOP records.'
                    : 'Whole batch forced to English.'}
              </span>
              <label className="flex items-center gap-2 text-xs">
                <span className="text-gray-600">Department (optional):</span>
                <input
                  type="text"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder="e.g. QA, QC"
                  className="w-32 rounded border border-gray-300 px-2 py-1 text-gray-800"
                />
              </label>
            </div>

            {uploading && uploadProgress && uploadProgress.total > 1 && (
              <p className="text-[11px] font-medium text-purple-700">
                Uploading batch {Math.min(uploadProgress.done + 1, uploadProgress.total)} of {uploadProgress.total} (
                {FILES_PER_CHUNK} files per request)…
              </p>
            )}

            {files.length > 0 && (
              <div className="border border-gray-200 rounded-lg p-2 max-h-48 overflow-y-auto">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[10px] font-medium text-gray-500">
                    {files.length} file(s) for bulk upload
                    {files.length > FILES_PER_CHUNK ? ` — sent in ${Math.ceil(files.length / FILES_PER_CHUNK)} batches` : ''}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => folderInputRef.current?.click()}
                      className="text-[10px] text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-0.5"
                    >
                      <FolderOpen className="h-3 w-3" /> + Add another folder
                    </button>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="text-[10px] text-blue-600 hover:text-blue-700 font-semibold"
                    >
                      + Add files
                    </button>
                    <button type="button" onClick={clearAll} className="text-[10px] text-red-600 hover:text-red-700 font-medium">Clear all</button>
                  </div>
                </div>
                <ul className="space-y-0.5">
                  {files.map((f, i) => (
                    <li key={`${f.name}-${i}-${f.size}`} className="flex items-center justify-between text-xs text-gray-700">
                      <span className="truncate flex items-center gap-1 min-w-0">
                        <FileText className="h-3 w-3 text-purple-500 shrink-0" />
                        {f.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeFile(i)}
                        className="text-red-500 hover:text-red-700 ml-1 shrink-0"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {result && (
              <div className={`rounded-lg p-3 text-xs ${result.failed > 0 ? 'bg-amber-50 border border-amber-200' : 'bg-green-50 border border-green-200'}`}>
                <p className="font-medium flex items-center gap-1">
                  {result.uploaded > 0 && <CheckCircle className="h-4 w-4 text-green-600" />}
                  {result.failed > 0 && <AlertCircle className="h-4 w-4 text-amber-600" />}
                  Uploaded: {result.uploaded} | Failed: {result.failed}
                  {result.storage === 'bunny' && ' (Bunny Storage)'}
                </p>
                {result.errors.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5 text-amber-800">
                    {result.errors.map((e, i) => (
                      <li key={i}>{e.fileName ? `${e.fileName}: ${e.error}` : e.error}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t border-gray-200 px-4 py-3 mt-auto">
            <button
              type="button"
              onClick={resetAndClose}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Close
            </button>
            <button
              type="submit"
              disabled={uploading || files.length === 0}
              className="rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-700 disabled:opacity-50 flex items-center gap-1"
            >
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              {uploading
                ? 'Uploading…'
                : uploadTab === 'gujarati'
                  ? `Upload Gujarati batch (${files.length})`
                  : `Bulk upload (${files.length})`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
