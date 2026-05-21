'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { X, Upload, Loader2, CheckCircle, AlertCircle, FolderOpen, Layers, FileText } from 'lucide-react';

interface SOPFolderUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function SOPFolderUploadModal({ isOpen, onClose, onSuccess }: SOPFolderUploadModalProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [language, setLanguage] = useState<'English' | 'Gujarati'>('English');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const [currentBatch, setCurrentBatch] = useState<string | null>(null);
  const [uploadLive, setUploadLive] = useState<{
    started: number;
    completed: number;
    active: number;
    totalFilesStarted: number;
  } | null>(null);
  const [activeBatchFiles, setActiveBatchFiles] = useState<Record<number, string[]>>({});
  const [dragActive, setDragActive] = useState(false);
  const [result, setResult] = useState<{
    totalQueued: number;
    processed: number;
    skippedOlderVersions: number;
    identifiers: number;
    versionsStored: number;
    uploadBatches: number;
    errors: Array<{ path: string; error: string }>;
    storage: string;
    maxPriorVersions: number;
    priorVersionsUnlimited: boolean;
  } | null>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const filesInputRef = useRef<HTMLInputElement>(null);

  const setFolderRef = useCallback((el: HTMLInputElement | null) => {
    folderInputRef.current = el;
    if (el) {
      el.setAttribute('webkitdirectory', '');
      el.setAttribute('directory', '');
    }
  }, []);

  /**
   * Adaptive chunk size: bigger requests when there are many files, smaller when few.
   * Each batch is additionally capped by a byte budget below so a few huge PDFs
   * don't push past the server's 50MB body limit (next.config.mjs).
   */
  const getFilesPerChunk = (totalFiles: number) => {
    if (totalFiles <= 30) return Math.max(1, totalFiles);
    if (totalFiles <= 200) return 25;
    if (totalFiles <= 800) return 40;
    return 50;
  };
  /** Run several batches at once instead of strictly one-by-one. */
  const MAX_PARALLEL_BATCHES = 4;
  /** Hard byte budget per request — keeps us comfortably under the 50MB server cap. */
  const MAX_BATCH_BYTES = 35 * 1024 * 1024;
  /** Retry transient network / 5xx / 429 failures before giving up on a batch. */
  const BATCH_MAX_ATTEMPTS = 3;

  /**
   * Annexures are supporting docs that should be skipped (faster uploads, no clutter
   * in version history). We detect them by the filename — `Annexure-I_…`, `Annex-…`,
   * `Appendix-…`, etc. BUT a main SOP file whose filename starts with the SOP code
   * (e.g. `QAGE08-09_VENDOR QUALITY AUDIT.docx`) must NEVER be filtered, even if its
   * descriptive title happens to contain the word "annex" somewhere later. Same goes
   * for parent folder segments — we only look at the file's own basename.
   */
  const isAnnexureLikePath = (p: string) => {
    const s = String(p || '');
    if (!s) return false;
    const fileName = s.split(/[\\/]/).pop() || s;
    // Main SOP files start with `<CODE><digits>-<digits>` (e.g. QAGE08-09_…, BSGE1-4 …).
    // If the basename matches this pattern, it's the SOP version file, not an annexure.
    // Use a negative lookahead instead of \b so `_` counts as a separator
    // (e.g. `QAGE74-2_FORMAT, ANNEXURE…docx` is a main file, not an annexure).
    if (/^[A-Z]{2,6}\d{1,4}-\d{1,3}(?![A-Za-z0-9])/i.test(fileName)) return false;
    return /\b(annexure|annex|appendix)\b/i.test(fileName);
  };

  useEffect(() => {
    if (!isOpen) return;
    setFiles([]);
    setResult(null);
    setUploadProgress(null);
    setCurrentBatch(null);
    setUploadLive(null);
    setActiveBatchFiles({});
    setLanguage('English');
  }, [isOpen]);

  if (!isOpen) return null;

  const isDoc = (f: File) =>
    f.name.endsWith('.docx') || f.name.endsWith('.doc') || f.name.endsWith('.pdf');

  const addFilesFromList = (list: File[]) => {
    const allowed = list
      .filter(isDoc)
      .filter((f) => !f.name.startsWith('~$'))
      .filter((f) => {
        const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
        return !isAnnexureLikePath(rel);
      });
    setFiles((prev) => {
      const keys = new Set(prev.map((f) => `${(f as any).webkitRelativePath || f.name}-${f.size}`));
      const toAdd = allowed.filter((f) => !keys.has(`${(f as any).webkitRelativePath || f.name}-${f.size}`));
      return [...prev, ...toAdd];
    });
  };

  const deriveBatchGroupKey = (f: File) => {
    const rel = ((f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name || '').toUpperCase();
    const m = rel.match(/([A-Z]{2,6}\d{1,4})-(\d{1,3})/);
    if (m) return `SOP:${m[1]}`;
    const parts = rel.split(/[\\/]/).filter(Boolean);
    if (parts.length >= 2) return `PATH:${parts[0]}/${parts[1]}`;
    if (parts.length === 1) return `PATH:${parts[0]}`;
    return `FILE:${f.name}`;
  };

  const batchBytes = (b: File[]) => b.reduce((s, f) => s + (f.size || 0), 0);

  const buildSmartBatches = (allFiles: File[], targetSize: number): File[][] => {
    const groups = new Map<string, File[]>();
    for (const f of allFiles) {
      const k = deriveBatchGroupKey(f);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(f);
    }
    const groupList = [...groups.values()].sort((a, b) => b.length - a.length);
    const batches: File[][] = [];

    const pushSharded = (g: File[]) => {
      // Shard a group into chunks that respect BOTH target file count and byte budget.
      let chunk: File[] = [];
      let chunkBytes = 0;
      for (const f of g) {
        const fSize = f.size || 0;
        const overCount = chunk.length + 1 > targetSize;
        const overBytes = chunkBytes + fSize > MAX_BATCH_BYTES && chunk.length > 0;
        if (overCount || overBytes) {
          batches.push(chunk);
          chunk = [];
          chunkBytes = 0;
        }
        chunk.push(f);
        chunkBytes += fSize;
      }
      if (chunk.length) batches.push(chunk);
    };

    for (const g of groupList) {
      const gBytes = batchBytes(g);
      if (g.length > targetSize || gBytes > MAX_BATCH_BYTES) {
        pushSharded(g);
      } else {
        let placed = false;
        for (const b of batches) {
          if (b.length + g.length <= targetSize && batchBytes(b) + gBytes <= MAX_BATCH_BYTES) {
            b.push(...g);
            placed = true;
            break;
          }
        }
        if (!placed) batches.push([...g]);
      }
    }
    return batches;
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
                  }, (err) => res());
                });
              } else if (entry.isDirectory) {
                const sub = await readAllFilesFromDir(entry as FileSystemDirectoryEntry);
                acc.push(...sub);
              }
            }
            readBatch();
          },
          (err) => reject(err),
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
        console.error(err);
        alert('Could not read folders. Use “Select folder” and pick a department or parent folder.');
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (files.length === 0) {
      alert(
        'Select a folder: department → SOP folders (e.g. QAGE01-10 – Title) → V8/V9/V10 (or code-version folders) with DOCX + PDF.',
      );
      return;
    }
    setUploading(true);
    setResult(null);
    const filesPerChunk = getFilesPerChunk(files.length);
    const batches = buildSmartBatches(files, filesPerChunk);
    setUploadProgress({ done: 0, total: batches.length });
    setUploadLive({
      started: 0,
      completed: 0,
      active: 0,
      totalFilesStarted: 0,
    });
    setActiveBatchFiles({});
    let totalProcessed = 0;
    let totalSkippedOlder = 0;
    /**
     * Each API batch returns `results` only for SOPs touched in that batch. For the same SOP in a later batch,
     * overwrite with the latest `entries.length` (reflects DB after that batch). Sum = total version *slots*
     * across all touched SOPs after the full run (capped per server config per SOP).
     */
    const latestEntryCountBySop = new Map<string, number>();
    const identifiersTouched = new Set<string>();
    const allErrors: Array<{ path: string; error: string }> = [];
    let storageLabel = 'bunny';
    let maxPriorVersions = 0;
    let priorVersionsUnlimited = true;

    try {
      let doneCount = 0;
      let nextIndex = 0;
      const totalChunks = batches.length;

      const runOneBatch = async (batchIndex: number) => {
        const slice = batches[batchIndex];
        const previewNames = slice
          .slice(0, 4)
          .map((f) => (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name);
        setActiveBatchFiles((prev) => ({ ...prev, [batchIndex]: previewNames }));
        setUploadLive((s) =>
          s
            ? {
                ...s,
                started: s.started + 1,
                active: s.active + 1,
                totalFilesStarted: s.totalFilesStarted + slice.length,
              }
            : s,
        );
        const formData = new FormData();
        formData.set('language', language);
        for (const f of slice) {
          const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
          formData.append(`files[${rel}]`, f);
        }
        try {
          type BatchResponse = {
            success?: boolean;
            error?: string;
            processed?: number;
            skippedOlderVersions?: number;
            maxPriorVersions?: number;
            priorVersionsUnlimited?: boolean;
            identifiers?: number;
            versionsStored?: number;
            errors?: Array<{ path: string; error: string }>;
            storage?: string;
            results?: Array<{ identifier: string; entries?: Array<{ version?: number }> }>;
          };

          let data: BatchResponse | null = null;
          let lastError: Error | null = null;
          for (let attempt = 1; attempt <= BATCH_MAX_ATTEMPTS; attempt++) {
            let res: Response;
            try {
              res = await fetch('/api/sop/folder-upload', { method: 'POST', body: formData });
            } catch (netErr) {
              const msg = netErr instanceof Error ? netErr.message : 'Network error';
              lastError = new Error(
                `${msg} (batch ${batchIndex + 1}/${totalChunks}, attempt ${attempt}/${BATCH_MAX_ATTEMPTS})`,
              );
              if (attempt < BATCH_MAX_ATTEMPTS) {
                await new Promise((r) => setTimeout(r, 800 * attempt * attempt));
                continue;
              }
              throw lastError;
            }
            const text = await res.text();
            let parsed: BatchResponse | null = null;
            try {
              parsed = JSON.parse(text) as BatchResponse;
            } catch {
              lastError = new Error(
                res.ok
                  ? `Invalid server response (batch ${batchIndex + 1}/${totalChunks})`
                  : `Server error ${res.status} (batch ${batchIndex + 1}/${totalChunks}): ${text.slice(0, 200)}`,
              );
              const retryable = !res.ok && (res.status >= 500 || res.status === 429 || res.status === 408);
              if (retryable && attempt < BATCH_MAX_ATTEMPTS) {
                await new Promise((r) => setTimeout(r, 800 * attempt * attempt));
                continue;
              }
              throw lastError;
            }
            if (!res.ok || parsed.success === false) {
              lastError = new Error(
                parsed.error || `Upload failed (batch ${batchIndex + 1}/${totalChunks})`,
              );
              const retryable = res.status >= 500 || res.status === 429 || res.status === 408;
              if (retryable && attempt < BATCH_MAX_ATTEMPTS) {
                await new Promise((r) => setTimeout(r, 800 * attempt * attempt));
                continue;
              }
              throw lastError;
            }
            data = parsed;
            break;
          }
          if (!data) throw lastError ?? new Error(`Upload failed (batch ${batchIndex + 1}/${totalChunks})`);

          totalProcessed += data.processed ?? 0;
          totalSkippedOlder += data.skippedOlderVersions ?? 0;
          if (data.priorVersionsUnlimited === true) {
            priorVersionsUnlimited = true;
            maxPriorVersions = 0;
          } else if (typeof data.maxPriorVersions === 'number' && data.maxPriorVersions > 0) {
            priorVersionsUnlimited = false;
            maxPriorVersions = data.maxPriorVersions;
          }
          if (data.storage) storageLabel = data.storage;
          if (Array.isArray(data.errors)) allErrors.push(...data.errors);
          if (Array.isArray(data.results)) {
            for (const r of data.results) {
              if (!r?.identifier) continue;
              identifiersTouched.add(r.identifier);
              const n = Array.isArray(r.entries) ? r.entries.length : 0;
              latestEntryCountBySop.set(r.identifier, n);
            }
          }
        } finally {
          setActiveBatchFiles((prev) => {
            const next = { ...prev };
            delete next[batchIndex];
            return next;
          });
          setUploadLive((s) =>
            s
              ? {
                  ...s,
                  completed: s.completed + 1,
                  active: Math.max(0, s.active - 1),
                }
              : s,
          );
        }
      };

      const worker = async () => {
        while (nextIndex < totalChunks) {
          const idx = nextIndex++;
          setCurrentBatch(`${idx + 1}/${totalChunks}`);
          try {
            await runOneBatch(idx);
          } catch (batchErr) {
            // Log a per-batch error and keep going — never let one batch kill the whole run.
            const msg = batchErr instanceof Error ? batchErr.message : String(batchErr);
            const previewNames = batches[idx]
              .slice(0, 2)
              .map((f) => (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name)
              .join(', ');
            allErrors.push({ path: previewNames, error: msg });
          }
          doneCount++;
          setUploadProgress({ done: doneCount, total: totalChunks });
        }
      };

      const workers = Array.from(
        { length: Math.min(MAX_PARALLEL_BATCHES, totalChunks) },
        () => worker(),
      );
      await Promise.all(workers);

      const totalVersionRows = [...latestEntryCountBySop.values()].reduce((a, b) => a + b, 0);

      setResult({
        totalQueued: files.length,
        processed: totalProcessed,
        skippedOlderVersions: totalSkippedOlder,
        maxPriorVersions,
        priorVersionsUnlimited,
        identifiers: identifiersTouched.size,
        versionsStored: totalVersionRows,
        uploadBatches: totalChunks,
        errors: allErrors,
        storage: storageLabel,
      });
      if (totalProcessed > 0 || identifiersTouched.size > 0) onSuccess();
    } catch (err) {
      const totalVersionRowsPartial = [...latestEntryCountBySop.values()].reduce((a, b) => a + b, 0);

      setResult({
        totalQueued: files.length,
        processed: totalProcessed,
        skippedOlderVersions: totalSkippedOlder,
        maxPriorVersions,
        priorVersionsUnlimited,
        identifiers: identifiersTouched.size,
        versionsStored: totalVersionRowsPartial,
        uploadBatches: batches.length,
        errors: [...allErrors, { path: '', error: err instanceof Error ? err.message : 'Failed' }],
        storage: storageLabel,
      });
    } finally {
      setUploading(false);
      setUploadProgress(null);
      setCurrentBatch(null);
      setUploadLive(null);
    }
  };

  const resetAndClose = () => {
    setFiles([]);
    setResult(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <h2 className="text-base font-bold text-gray-800 flex items-center gap-2">
            <Layers className="h-4 w-4 text-teal-600" />
            SOP folder upload
          </h2>
          <button type="button" onClick={resetAndClose} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="px-4 py-3 space-y-3 overflow-y-auto text-xs text-gray-700">
            <div className="rounded-lg border border-teal-200 bg-teal-50/80 px-3 py-2 space-y-1">
              <p className="font-bold text-teal-900">Expected structure</p>
              <pre className="text-[10px] leading-relaxed text-teal-900/90 whitespace-pre-wrap font-mono">
                {`DeptFolder/QA/
  QAGE01-10 – Title/       ← SOP number + name
    V8/  V9/  V10/        ← version folders (all priors below current SOP rev kept by default)
      *.docx  *.pdf

  — or version-as-folder —
    QAGE01-08/
    QAGE01-09/
    QAGE01-10/
      *.docx  *.pdf

  — QC / Microbiology doc-style (QCGE, QAIO, QCMI, …) —
    QC/QCGE - General/
      QCGE04 - Title/
        Annexure-I.docx
        Reference/*.pdf`}
              </pre>
              <p className="text-[11px] text-teal-900/90">
                The first path segment should include a department keyword (QA, QC, Microbiology, Store, …). The system detects SOP
                number, title from folder names, and version (V8, code-version folders, etc.). SOPs with only one or two
                prior versions are fine. By default <strong>all</strong> prior revisions below the current SOP number are
                kept (merged with the database). To limit storage, set env{' '}
                <code className="rounded bg-white/80 px-0.5">SOP_FOLDER_UPLOAD_MAX_PRIOR_VERSIONS</code> to a positive
                integer (newest N only) or <code className="rounded bg-white/80 px-0.5">0</code> /{' '}
                <code className="rounded bg-white/80 px-0.5">unlimited</code> for no cap.
                Files are stored in{' '}
                <strong>Bunny</strong> — configure env keys if uploads fail. Uploads run in automatic batches. The SOP
                registry lists these rows even if you have not uploaded a separate “main” SOP record — refresh the
                dashboard after a successful run.
                <br />
                <strong>Annexure/Appendix files are skipped at selection time</strong> for faster version uploads.
              </p>
            </div>

            <input
              ref={setFolderRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                const list = e.target.files;
                if (list) addFilesFromList(Array.from(list));
                e.target.value = '';
              }}
            />

            <input
              ref={filesInputRef}
              type="file"
              multiple
              accept=".doc,.docx,.pdf"
              className="hidden"
              onChange={(e) => {
                const list = e.target.files;
                if (list) addFilesFromList(Array.from(list));
                e.target.value = '';
              }}
            />

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              className={`rounded-xl border-2 border-dashed px-4 py-5 text-center transition-colors ${
                dragActive ? 'border-teal-500 bg-teal-50' : 'border-gray-300 bg-gray-50 hover:border-teal-300'
              }`}
            >
              <Upload className="h-8 w-8 mx-auto mb-2 text-teal-500" />
              <p className="text-xs font-medium text-gray-700 mb-2">Drag department folder(s) or file(s) here or</p>
              <div className="flex items-center justify-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => folderInputRef.current?.click()}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-400 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100"
                >
                  <FolderOpen className="h-3.5 w-3.5" /> Select folder
                </button>
                <button
                  type="button"
                  onClick={() => filesInputRef.current?.click()}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-400 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100"
                >
                  <FileText className="h-3.5 w-3.5" /> Select files
                </button>
              </div>
              <p className="mt-1.5 text-[10px] text-gray-500">
                Folder preserves structure; files alone are uploaded by filename (must start with SOP code like <code>QAGE08-09…</code>).
              </p>
            </div>

            <label className="flex items-center gap-2 text-xs">
              <span className="text-gray-600">Registry language:</span>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as 'English' | 'Gujarati')}
                className="rounded border border-gray-300 text-gray-800 text-xs"
              >
                <option value="English">English</option>
                <option value="Gujarati">Gujarati</option>
              </select>
            </label>
            <p className="text-[10px] text-gray-500">
              This registry upload uses one language for the whole batch. For English and Gujarati files together, use{' '}
              <strong>Bulk upload SOP</strong> with <strong>Auto (detect per file)</strong>.
            </p>

            {files.length > 0 && (
              <p className="text-[10px] font-medium text-gray-500">
                {files.length} file(s) queued (relative paths preserved)
                {files.length > getFilesPerChunk(files.length) && (
                  <span className="text-teal-700">
                    {' '}
                    · will send in ~{buildSmartBatches(files, getFilesPerChunk(files.length)).length} batches
                  </span>
                )}
              </p>
            )}

            {uploadProgress && (() => {
              const batchPct = uploadProgress.total > 0
                ? Math.min(100, Math.round((uploadProgress.done / uploadProgress.total) * 100))
                : 0;
              return (
              <div className="rounded border border-teal-200 bg-teal-50 px-2 py-2">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-semibold text-teal-800">
                    Uploading batches {uploadProgress.done}/{uploadProgress.total}
                    {currentBatch ? ` (active ${currentBatch})` : ''}…
                  </p>
                  <span className="text-[10px] font-bold text-teal-800">{batchPct}%</span>
                </div>
                <div className="mt-1 h-2 w-full rounded-full bg-teal-100 overflow-hidden">
                  <div
                    className="h-full bg-teal-600 transition-all duration-300 ease-out"
                    style={{ width: `${batchPct}%` }}
                  />
                </div>
                {uploadLive && (
                  <>
                    {files.length > 0 && (
                      <div className="mt-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-teal-900">
                            Files sent: <strong>{uploadLive.totalFilesStarted}</strong>/{files.length}
                          </span>
                          <span className="text-[10px] font-semibold text-teal-800">
                            {Math.min(100, Math.round((uploadLive.totalFilesStarted / files.length) * 100))}%
                          </span>
                        </div>
                        <div className="mt-0.5 h-1.5 w-full rounded-full bg-teal-100 overflow-hidden">
                          <div
                            className="h-full bg-teal-500 transition-all duration-300 ease-out"
                            style={{
                              width: `${Math.min(100, Math.round((uploadLive.totalFilesStarted / files.length) * 100))}%`,
                            }}
                          />
                        </div>
                      </div>
                    )}
                    <p className="mt-1.5 text-[10px] text-teal-900">
                      Started: <strong>{uploadLive.started}</strong> · Completed:{" "}
                      <strong>{uploadLive.completed}</strong> · Active:{" "}
                      <strong>{uploadLive.active}</strong>
                    </p>
                    {Object.keys(activeBatchFiles).length > 0 && (
                      <div className="mt-1 rounded border border-teal-200 bg-white px-2 py-1">
                        <p className="text-[10px] font-semibold text-teal-800">
                          Currently uploading files:
                        </p>
                        <ul className="mt-0.5 max-h-24 overflow-y-auto text-[10px] text-teal-900">
                          {Object.entries(activeBatchFiles).map(([batchNo, names]) =>
                            names.map((n, i) => (
                              <li key={`${batchNo}-${i}`}>
                                B{Number(batchNo) + 1}: {n}
                              </li>
                            )),
                          )}
                        </ul>
                      </div>
                    )}
                  </>
                )}
              </div>
              );
            })()}

            {result &&
              (() => {
                const fileErrorsCount = result.errors.filter((e) => e.path && e.path.length > 0).length;
                const accounted = result.processed + result.skippedOlderVersions + fileErrorsCount;
                const remainingFiles = Math.max(0, result.totalQueued - accounted);
                return (
                  <div
                    className={`rounded-lg p-3 text-xs ${
                      result.errors.length > 0 && result.processed === 0
                        ? 'bg-red-50 border border-red-200'
                        : 'bg-green-50 border border-green-200'
                    }`}
                  >
                    <p className="font-medium flex flex-wrap items-center gap-x-1 gap-y-0.5">
                      {result.processed > 0 && <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />}
                      {result.processed === 0 && result.errors.length > 0 && (
                        <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
                      )}
                      <span>
                        Files: <strong>{result.processed}</strong> uploaded of <strong>{result.totalQueued}</strong> queued
                        {remainingFiles > 0 ? (
                          <span className="text-amber-900">
                            {' '}
                            — <strong>{remainingFiles}</strong> not uploaded (see below)
                          </span>
                        ) : (
                          <span className="text-green-800"> — none remaining</span>
                        )}
                      </span>
                    </p>
                    <p className="mt-1 text-[11px] text-gray-700">
                      SOPs updated: <strong>{result.identifiers}</strong>
                      {' · '}
                      Version rows stored (sum over SOPs, this run): <strong>{result.versionsStored}</strong>
                      <span className="text-gray-600">
                        {' '}
                        (
                        {result.priorVersionsUnlimited
                          ? 'all eligible prior versions are kept per SOP; '
                          : `each SOP holds up to ${result.maxPriorVersions} prior version slots; `}
                        this total adds slots for every SOP updated in this upload)
                      </span>
                      {result.uploadBatches > 1 && (
                        <span className="text-gray-600"> · Sent in {result.uploadBatches} batches</span>
                      )}
                          {result.skippedOlderVersions > 0 && (
                        <span className="text-amber-800">
                          {' '}
                          · {result.skippedOlderVersions} file(s) skipped
                          {result.priorVersionsUnlimited
                            ? ' (e.g. folder revision newer than the SOP number in the registry, parse mismatch, or internal key mismatch)'
                            : ` (outside top ${result.maxPriorVersions} prior versions per SOP)`}
                        </span>
                      )}
                      {fileErrorsCount > 0 && (
                        <span className="text-red-800"> · {fileErrorsCount} path/parse or upload error(s)</span>
                      )}
                      {remainingFiles > 0 && fileErrorsCount === 0 && result.skippedOlderVersions === 0 && (
                        <span className="text-gray-600">
                          {' '}
                          — gap often means 0-byte files or a stopped run; re-upload missing files if needed.
                        </span>
                      )}
                      {' · '}
                      {result.storage}
                    </p>
                    {result.errors.length > 0 && (
                      <ul className="mt-1 text-amber-900 text-[10px] max-h-24 overflow-y-auto">
                        {result.errors.slice(0, 12).map((er, i) => (
                          <li key={i}>
                            {er.path ? `${er.path}: ` : ''}
                            {er.error}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })()}
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
              className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700 disabled:opacity-50 flex items-center gap-1"
            >
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              {uploading ? 'Uploading…' : 'Upload'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
