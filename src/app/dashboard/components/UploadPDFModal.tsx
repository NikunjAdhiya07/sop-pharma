'use client';

import React, { useState, useRef } from 'react';
import { X, Upload, FileText, Loader2, CheckCircle, AlertCircle, FolderOpen, FileCheck } from 'lucide-react';

interface UploadPDFModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function UploadPDFModal({ isOpen, onClose, onSuccess }: UploadPDFModalProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [result, setResult] = useState<{
    uploaded: number;
    failed: number;
    matched: number;
    unmatched: number;
    results: Array<{ fileName: string; sopIdentifier: string; sopName: string; department: string; matched: boolean }>;
    errors: Array<{ fileName: string; error: string }>;
    storage: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const setFolderRef = React.useCallback((el: HTMLInputElement | null) => {
    folderInputRef.current = el;
    if (el) {
      el.setAttribute('webkitdirectory', '');
      el.setAttribute('directory', '');
    }
  }, []);

  if (!isOpen) return null;

  const isPdf = (f: File) => f.name.toLowerCase().endsWith('.pdf');

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const newFiles = Array.from(list).filter(isPdf);
    setFiles((prev) => {
      const keys = new Set(prev.map((f) => `${f.name}-${f.size}-${f.lastModified}`));
      const toAdd = newFiles.filter((f) => !keys.has(`${f.name}-${f.size}-${f.lastModified}`));
      return [...prev, ...toAdd];
    });
  };

  const addFilesFromList = (list: File[]) => {
    const allowed = list.filter(isPdf);
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
                await new Promise<void>((res, rej) => {
                  (entry as FileSystemFileEntry).file((f) => {
                    acc.push(f);
                    res();
                  }, rej);
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
      alert('Please select at least one PDF file.');
      return;
    }
    setUploading(true);
    setResult(null);
    try {
      const formData = new FormData();
      files.forEach((f) => {
        formData.append('files', f);
        formData.append('paths', f.webkitRelativePath || f.name);
      });
      const res = await fetch('/api/sop/upload-pdf-batch', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setResult({
        uploaded: data.uploaded ?? 0,
        failed: data.failed ?? 0,
        matched: data.matched ?? 0,
        unmatched: data.unmatched ?? 0,
        results: data.results ?? [],
        errors: data.errors ?? [],
        storage: data.storage ?? 'local',
      });
      if (data.uploaded > 0) onSuccess();
    } catch (err) {
      setResult({
        uploaded: 0,
        failed: files.length,
        matched: 0,
        unmatched: 0,
        results: [],
        errors: [{ fileName: '', error: err instanceof Error ? err.message : 'Upload failed' }],
        storage: 'local',
      });
    } finally {
      setUploading(false);
    }
  };

  const resetAndClose = () => {
    setFiles([]);
    setResult(null);
    onClose();
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <h2 className="text-base font-bold text-gray-800 flex items-center gap-2">
            <FileCheck className="h-4 w-4 text-red-600" />
            Bulk Upload PDF (for SOP Registry)
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
          <div className="px-4 py-3 space-y-3 overflow-y-auto">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5 text-xs text-blue-800">
              <p className="font-semibold mb-0.5">How it works:</p>
              <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                <li>Upload PDF copies of your SOPs (e.g. scanned/signed versions)</li>
                <li>Filenames must contain the SOP code (e.g. <strong>MAGE01-08</strong>.pdf)</li>
                <li>PDFs are auto-matched to existing SOPs and appear as <strong>PDF</strong> links alongside <strong>DOCX</strong> in the registry</li>
                <li><strong>Multiple folders:</strong> Drag &amp; drop all department folders at once, or use &quot;Select folder&quot; repeatedly to add one folder at a time</li>
              </ul>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
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
                  ? 'border-red-500 bg-red-50'
                  : 'border-gray-300 bg-gray-50 hover:border-red-300 hover:bg-red-50/50'
              }`}
            >
              <Upload className="h-8 w-8 mx-auto mb-2 text-red-500" />
              <p className="text-xs font-medium text-gray-700 mb-1">
                Drag all department folders here at once (supports multiple), or
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
                >
                  Select PDFs
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

            {files.length > 0 && (
              <div className="border border-gray-200 rounded-lg p-2 max-h-48 overflow-y-auto">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[10px] font-medium text-gray-500">
                    {files.length} PDF file{files.length !== 1 ? 's' : ''} selected
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
                    <button
                      type="button"
                      onClick={clearAll}
                      className="text-[10px] text-red-600 hover:text-red-700 font-medium"
                    >
                      Clear all
                    </button>
                  </div>
                </div>
                <ul className="space-y-0.5">
                  {files.map((f, i) => (
                    <li
                      key={`${f.name}-${i}-${f.size}`}
                      className="flex items-center justify-between text-xs text-gray-700"
                    >
                      <span className="truncate flex items-center gap-1 min-w-0">
                        <FileText className="h-3 w-3 text-red-500 shrink-0" />
                        <span className="truncate">{f.name}</span>
                        <span className="text-[9px] text-gray-400 shrink-0">
                          ({formatFileSize(f.size)})
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => removeFile(i)}
                        className="text-red-500 hover:text-red-700 ml-1 shrink-0 text-[10px]"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {result && (
              <div
                className={`rounded-lg p-3 text-xs ${
                  result.failed > 0
                    ? 'bg-amber-50 border border-amber-200'
                    : 'bg-green-50 border border-green-200'
                }`}
              >
                <p className="font-medium flex items-center gap-1">
                  {result.uploaded > 0 && (
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  )}
                  {result.failed > 0 && (
                    <AlertCircle className="h-4 w-4 text-amber-600" />
                  )}
                  Uploaded: {result.uploaded} | Failed: {result.failed}
                  {result.storage === 'bunny' && ' (Bunny Storage)'}
                </p>
                {result.uploaded > 0 && (
                  <p className="mt-1 text-[11px] text-gray-600">
                    Matched to existing SOP: <strong>{result.matched}</strong> |
                    New entries: <strong>{result.unmatched}</strong>
                  </p>
                )}
                {result.results.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5 text-green-800">
                    {result.results.map((r, i) => (
                      <li key={i} className="flex items-center gap-1">
                        <CheckCircle className="h-3 w-3 shrink-0" />
                        <span className="font-semibold">{r.sopIdentifier}</span>
                        <span className="text-gray-500">—</span>
                        <span className="truncate">{r.fileName}</span>
                        {r.matched && (
                          <span className="ml-auto text-[9px] bg-green-200 text-green-800 px-1 rounded font-semibold shrink-0">
                            Matched
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {result.errors.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5 text-amber-800">
                    {result.errors.map((e, i) => (
                      <li key={i}>
                        {e.fileName ? `${e.fileName}: ${e.error}` : e.error}
                      </li>
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
              className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50 flex items-center gap-1"
            >
              {uploading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5" />
              )}
              {uploading ? 'Uploading…' : `Upload PDFs (${files.length})`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
