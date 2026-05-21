'use client';

import React, { useRef, useState } from 'react';
import {
  X,
  Upload,
  Loader2,
  AlertCircle,
  CheckCircle,
  Video as VideoIcon,
  Image as ImageIcon,
  FileText,
  Trash2,
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const VIDEO_EXTS = ['mp4', 'mov', 'webm'];
const SLIDE_EXTS = ['pdf'];

type Status = 'pending' | 'uploading' | 'done' | 'error';
type RowKind = 'video' | 'slide';

type Row = {
  id: string;
  kind: RowKind;
  file: File;
  progress: number;
  status: Status;
  error?: string;
};

export default function VideoUploadModal({ isOpen, onClose, onSuccess }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [thumbFile, setThumbFile] = useState<File | null>(null);
  const [running, setRunning] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const slideInputRef = useRef<HTMLInputElement>(null);
  const thumbRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const reset = () => {
    setRows([]);
    setThumbFile(null);
    setRunning(false);
    setGlobalError(null);
  };

  const close = () => {
    if (running) return;
    reset();
    onClose();
  };

  const addFiles = (list: FileList | null, kind: RowKind) => {
    if (!list || list.length === 0) return;
    const allowed = kind === 'video' ? VIDEO_EXTS : SLIDE_EXTS;
    const valid: Row[] = [];
    const rejected: string[] = [];
    Array.from(list).forEach((f) => {
      const ext = f.name.split('.').pop()?.toLowerCase() || '';
      if (!allowed.includes(ext)) {
        rejected.push(f.name);
        return;
      }
      valid.push({
        id: `${kind}-${f.name}-${f.size}-${f.lastModified}-${Math.random().toString(36).slice(2, 6)}`,
        kind,
        file: f,
        progress: 0,
        status: 'pending',
      });
    });
    if (rejected.length) {
      setGlobalError(
        `Skipped unsupported ${kind} file(s): ${rejected.join(', ')}. Allowed: ${allowed.join(', ').toUpperCase()}`,
      );
    } else {
      setGlobalError(null);
    }
    setRows((prev) => [...prev, ...valid]);
  };

  const removeRow = (id: string) => {
    if (running) return;
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const uploadOne = (row: Row) =>
    new Promise<boolean>((resolve) => {
      const fd = new FormData();
      const endpoint =
        row.kind === 'video'
          ? '/api/training-content/videos'
          : '/api/training-content/slides';
      // Videos use field name `video` (+ optional shared `thumbnail`);
      // slides use field name `slide`.
      if (row.kind === 'video') {
        fd.append('video', row.file);
        if (thumbFile) fd.append('thumbnail', thumbFile);
      } else {
        fd.append('slide', row.file);
      }

      const xhr = new XMLHttpRequest();
      xhr.open('POST', endpoint);
      xhr.upload.onprogress = (ev) => {
        if (!ev.lengthComputable) return;
        const pct = Math.round((ev.loaded / ev.total) * 100);
        setRows((prev) =>
          prev.map((r) => (r.id === row.id ? { ...r, progress: pct } : r)),
        );
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          setRows((prev) =>
            prev.map((r) =>
              r.id === row.id ? { ...r, status: 'done', progress: 100 } : r,
            ),
          );
          resolve(true);
        } else {
          let msg = `Upload failed (${xhr.status})`;
          try {
            const j = JSON.parse(xhr.responseText);
            if (j?.error) msg = j.error;
          } catch {
            /* ignore */
          }
          setRows((prev) =>
            prev.map((r) =>
              r.id === row.id ? { ...r, status: 'error', error: msg } : r,
            ),
          );
          resolve(false);
        }
      };
      xhr.onerror = () => {
        setRows((prev) =>
          prev.map((r) =>
            r.id === row.id
              ? { ...r, status: 'error', error: 'Network error' }
              : r,
          ),
        );
        resolve(false);
      };
      setRows((prev) =>
        prev.map((r) => (r.id === row.id ? { ...r, status: 'uploading' } : r)),
      );
      xhr.send(fd);
    });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const pending = rows.filter((r) => r.status === 'pending' || r.status === 'error');
    if (pending.length === 0) {
      setGlobalError('Choose at least one video or slide file.');
      return;
    }
    setGlobalError(null);
    setRunning(true);
    let okCount = 0;
    for (const r of pending) {
      // eslint-disable-next-line no-await-in-loop
      const ok = await uploadOne(r);
      if (ok) okCount++;
    }
    setRunning(false);
    if (okCount > 0) onSuccess();
    if (okCount === pending.length) {
      setTimeout(() => {
        reset();
        onClose();
      }, 400);
    }
  };

  const videoRows = rows.filter((r) => r.kind === 'video');
  const slideRows = rows.filter((r) => r.kind === 'slide');
  const totalSize = rows.reduce((sum, r) => sum + r.file.size, 0);
  const doneCount = rows.filter((r) => r.status === 'done').length;
  const errorCount = rows.filter((r) => r.status === 'error').length;
  const pendingCount = rows.filter((r) => r.status === 'pending' || r.status === 'error').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-xl rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-800">
            <VideoIcon className="h-5 w-5 text-purple-600" /> Upload Training Videos &amp; Slides
          </h2>
          <button onClick={close} disabled={running} className="rounded p-1 hover:bg-gray-100 disabled:opacity-50">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-3 px-5 py-4">
          <div>
            <label className="text-xs font-medium text-gray-600">
              Video files (MP4 / MOV / WEBM — select multiple, e.g. Brief + Explainer)
            </label>
            <div className="mt-1 flex items-center gap-2">
              <button
                type="button"
                onClick={() => videoInputRef.current?.click()}
                disabled={running}
                className="flex items-center gap-1 rounded border border-purple-300 bg-purple-50 px-3 py-1.5 text-sm text-purple-700 hover:bg-purple-100 disabled:opacity-50"
              >
                <Upload className="h-4 w-4" /> Choose videos
              </button>
              <span className="text-xs text-gray-600">
                {videoRows.length > 0
                  ? `${videoRows.length} video(s)`
                  : 'No videos selected'}
              </span>
              <input
                ref={videoInputRef}
                type="file"
                multiple
                accept=".mp4,.mov,.webm,video/mp4,video/quicktime,video/webm"
                className="hidden"
                onChange={(e) => {
                  addFiles(e.target.files, 'video');
                  e.target.value = '';
                }}
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600">
              Slide files (PDF — select multiple)
            </label>
            <div className="mt-1 flex items-center gap-2">
              <button
                type="button"
                onClick={() => slideInputRef.current?.click()}
                disabled={running}
                className="flex items-center gap-1 rounded border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-sm text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
              >
                <FileText className="h-4 w-4" /> Choose slides
              </button>
              <span className="text-xs text-gray-600">
                {slideRows.length > 0
                  ? `${slideRows.length} PDF slide(s)`
                  : 'No slides selected'}
              </span>
              <input
                ref={slideInputRef}
                type="file"
                multiple
                accept=".pdf,application/pdf"
                className="hidden"
                onChange={(e) => {
                  addFiles(e.target.files, 'slide');
                  e.target.value = '';
                }}
              />
            </div>
          </div>

          {rows.length > 0 && (
            <div className="rounded border border-gray-200">
              <div className="border-b border-gray-100 bg-gray-50 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-gray-500">
                {rows.length} file(s) · {(totalSize / (1024 * 1024)).toFixed(1)} MB total
              </div>
              <div className="max-h-56 overflow-y-auto">
                {rows.map((r) => (
                  <div key={r.id} className="flex items-center gap-2 border-b border-gray-100 px-2 py-1.5 last:border-0">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="flex min-w-0 items-center gap-1">
                          <span
                            className={`shrink-0 rounded px-1 py-px text-[9px] font-semibold ${
                              r.kind === 'video'
                                ? 'bg-purple-100 text-purple-700'
                                : 'bg-indigo-100 text-indigo-700'
                            }`}
                          >
                            {r.kind === 'video' ? 'VIDEO' : 'SLIDE'}
                          </span>
                          <span className="truncate text-gray-700" title={r.file.name}>
                            {r.file.name}
                          </span>
                        </span>
                        <span className="ml-2 shrink-0 text-gray-500">
                          {(r.file.size / (1024 * 1024)).toFixed(1)} MB
                        </span>
                      </div>
                      <div className="mt-0.5 h-1.5 w-full rounded bg-gray-100">
                        <div
                          className={`h-1.5 rounded transition-all ${
                            r.status === 'error'
                              ? 'bg-red-500'
                              : r.status === 'done'
                                ? 'bg-emerald-500'
                                : r.kind === 'video'
                                  ? 'bg-purple-500'
                                  : 'bg-indigo-500'
                          }`}
                          style={{ width: `${r.progress}%` }}
                        />
                      </div>
                      {r.status === 'error' && (
                        <div className="mt-0.5 text-[11px] text-red-700">{r.error}</div>
                      )}
                    </div>
                    <div className="w-14 shrink-0 text-right text-[11px]">
                      {r.status === 'uploading' && (
                        <span className="text-purple-700">{r.progress}%</span>
                      )}
                      {r.status === 'done' && (
                        <span className="inline-flex items-center gap-0.5 text-emerald-700">
                          <CheckCircle className="h-3.5 w-3.5" /> Done
                        </span>
                      )}
                      {r.status === 'error' && <span className="text-red-700">Failed</span>}
                      {r.status === 'pending' && <span className="text-gray-500">Queued</span>}
                    </div>
                    {!running && r.status !== 'done' && (
                      <button
                        type="button"
                        onClick={() => removeRow(r.id)}
                        className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-red-600"
                        title="Remove from queue"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-gray-600">
              Video thumbnail image (optional — shared across all videos in this batch)
            </label>
            <div className="mt-1 flex items-center gap-2">
              <button
                type="button"
                onClick={() => thumbRef.current?.click()}
                disabled={running}
                className="flex items-center gap-1 rounded border border-gray-300 bg-gray-50 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50"
              >
                <ImageIcon className="h-4 w-4" /> Choose image
              </button>
              <span className="truncate text-xs text-gray-600">{thumbFile?.name || 'No thumbnail'}</span>
              {thumbFile && !running && (
                <button
                  type="button"
                  onClick={() => setThumbFile(null)}
                  className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-red-600"
                  title="Remove thumbnail"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
              <input
                ref={thumbRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  setThumbFile(e.target.files?.[0] || null);
                  e.target.value = '';
                }}
              />
            </div>
          </div>

          {globalError && (
            <div className="flex items-start gap-2 rounded bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {globalError}
            </div>
          )}

          {(doneCount > 0 || errorCount > 0) && !running && (
            <div className="text-xs text-gray-600">
              {doneCount > 0 && <span className="text-emerald-700">{doneCount} uploaded</span>}
              {doneCount > 0 && errorCount > 0 && ' · '}
              {errorCount > 0 && (
                <span className="text-red-700">{errorCount} failed — fix the file or retry</span>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 border-t pt-3">
            <button
              type="button"
              onClick={close}
              disabled={running}
              className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Close
            </button>
            <button
              type="submit"
              disabled={running || rows.length === 0 || rows.every((r) => r.status === 'done')}
              className="flex items-center gap-1 rounded bg-purple-600 px-3 py-1.5 text-sm text-white hover:bg-purple-700 disabled:opacity-50"
            >
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {running ? `Uploading ${doneCount + 1}/${rows.length}…` : `Upload ${pendingCount || ''}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
