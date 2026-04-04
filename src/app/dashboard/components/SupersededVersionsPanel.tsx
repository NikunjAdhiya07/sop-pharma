'use client';

import { useMemo, useEffect } from 'react';
import { fileKindFromStoredPath } from '@/lib/filePathFileKind';
import { buildViewDocHref } from '@/lib/viewDocLinks';
import { X, Archive } from 'lucide-react';

type ArtifactEntry = { version: number; docxPath?: string; pdfPath?: string };

export type SupersededGroup = {
  sopNo: string;
  department?: string;
  english: ArtifactEntry[];
  gujarati: ArtifactEntry[];
};

function collectSuperseded(data: any[]): SupersededGroup[] {
  const map = new Map<string, SupersededGroup>();
  for (const row of data || []) {
    const sopNo = String(row?.sopNo || '').trim();
    if (!sopNo) continue;
    const en = Array.isArray(row.versionArtifactsSuperseded) ? row.versionArtifactsSuperseded : [];
    const guj = Array.isArray(row.versionArtifactsGujaratiSuperseded) ? row.versionArtifactsGujaratiSuperseded : [];
    if (en.length === 0 && guj.length === 0) continue;
    const g = map.get(sopNo) || {
      sopNo,
      department: row.department,
      english: [],
      gujarati: [],
    };
    g.department = row.department || g.department;
    g.english = mergeByVersion(g.english, en);
    g.gujarati = mergeByVersion(g.gujarati, guj);
    map.set(sopNo, g);
  }
  return [...map.values()].sort((a, b) => a.sopNo.localeCompare(b.sopNo, undefined, { numeric: true }));
}

function mergeByVersion(a: ArtifactEntry[], b: ArtifactEntry[]): ArtifactEntry[] {
  const m = new Map<number, ArtifactEntry>();
  for (const e of [...a, ...b]) {
    const v = typeof e.version === 'number' ? e.version : parseInt(String(e.version), 10);
    if (!Number.isFinite(v)) continue;
    const cur = m.get(v) || { version: v };
    m.set(v, {
      version: v,
      docxPath: e.docxPath || cur.docxPath,
      pdfPath: e.pdfPath || cur.pdfPath,
    });
  }
  return [...m.values()]
    .filter((e) => (e.docxPath && e.docxPath.trim()) || (e.pdfPath && e.pdfPath.trim()))
    .sort((x, y) => y.version - x.version);
}

function viewDocUrl(path: string, type: string, sopNo: string, lang: 'English' | 'Gujarati') {
  const kind = fileKindFromStoredPath(path, type);
  if (kind === 'docx' || kind === 'doc') {
    return buildViewDocHref(path, sopNo, lang);
  }
  const dl = new URLSearchParams();
  dl.set('path', path);
  dl.set('open', '1');
  dl.set('identifier', sopNo);
  dl.set('language', lang);
  return `/api/files/download?${dl.toString()}`;
}

function formatV(v: number) {
  if (!Number.isFinite(v)) return 'v?';
  if (v < 100) return `v${String(v).padStart(2, '0')}`;
  return `v${v}`;
}

export default function SupersededVersionsPanel({
  open,
  onClose,
  data,
}: {
  open: boolean;
  onClose: () => void;
  data: any[];
}) {
  const groups = useMemo(() => collectSuperseded(data), [data]);
  const totalSlots = useMemo(
    () => groups.reduce((n, g) => n + g.english.length + g.gujarati.length, 0),
    [groups],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-3 sm:p-6"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="my-4 w-full max-w-3xl rounded-xl border border-gray-200 bg-white shadow-xl"
        role="dialog"
        aria-labelledby="superseded-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-gray-200 bg-amber-50/90 px-4 py-3">
          <div className="flex items-center gap-2 min-w-0">
            <Archive className="h-5 w-5 shrink-0 text-amber-800" />
            <div className="min-w-0">
              <h2 id="superseded-title" className="text-sm font-bold text-gray-900">
                Prior Version Archive
              </h2>
              <p className="text-[11px] text-amber-900/90">
                Older prior-version files (beyond the two newest shown in the registry &quot;Prior versions&quot; column).{' '}
                <span className="tabular-nums font-semibold">{totalSlots}</span> file slot
                {totalSlots !== 1 ? 's' : ''} across <span className="tabular-nums font-semibold">{groups.length}</span> SOP
                {groups.length !== 1 ? 's' : ''}.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-2 text-gray-500 hover:bg-amber-100 hover:text-gray-800"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[min(70vh,560px)] overflow-y-auto px-4 py-3">
          {groups.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">No superseded prior versions in the current dataset.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {groups.map((g) => (
                <li
                  key={g.sopNo}
                  className="rounded-lg border border-amber-200/80 bg-amber-50/40 px-3 py-2.5 text-[11px]"
                >
                  <div className="flex flex-wrap items-baseline gap-2 border-b border-amber-200/60 pb-1.5 mb-2">
                    <span className="font-mono text-xs font-bold text-purple-800">{g.sopNo}</span>
                    {g.department ? (
                      <span className="rounded bg-gray-200 px-1.5 py-px text-[9px] font-semibold text-gray-700">
                        {g.department}
                      </span>
                    ) : null}
                  </div>
                  {g.english.length > 0 && (
                    <div className="mb-2">
                      <span className="text-[9px] font-bold uppercase tracking-wide text-gray-600">English</span>
                      <ul className="mt-1 space-y-1">
                        {g.english.map((e) => (
                          <li key={`en-${e.version}`} className="flex flex-wrap items-center gap-2 text-[10px]">
                            <span className="font-bold tabular-nums text-gray-800">{formatV(e.version)}</span>
                            {e.docxPath ? (
                              <a
                                href={viewDocUrl(e.docxPath, 'docx', g.sopNo, 'English')}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-semibold text-purple-700 underline hover:text-purple-900"
                              >
                                DOCX
                              </a>
                            ) : (
                              <span className="text-gray-300">DOCX</span>
                            )}
                            <span className="text-gray-300">·</span>
                            {e.pdfPath ? (
                              <a
                                href={viewDocUrl(e.pdfPath, 'pdf', g.sopNo, 'English')}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-semibold text-blue-700 underline hover:text-blue-900"
                              >
                                PDF
                              </a>
                            ) : (
                              <span className="text-gray-300">PDF</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {g.gujarati.length > 0 && (
                    <div>
                      <span className="text-[9px] font-bold uppercase tracking-wide text-indigo-700">Gujarati</span>
                      <ul className="mt-1 space-y-1">
                        {g.gujarati.map((e) => (
                          <li key={`gj-${e.version}`} className="flex flex-wrap items-center gap-2 text-[10px]">
                            <span className="font-bold tabular-nums text-gray-800">{formatV(e.version)}</span>
                            {e.docxPath ? (
                              <a
                                href={viewDocUrl(e.docxPath, 'docx', g.sopNo, 'Gujarati')}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-semibold text-purple-700 underline hover:text-purple-900"
                              >
                                DOCX
                              </a>
                            ) : (
                              <span className="text-gray-300">DOCX</span>
                            )}
                            <span className="text-gray-300">·</span>
                            {e.pdfPath ? (
                              <a
                                href={viewDocUrl(e.pdfPath, 'pdf', g.sopNo, 'Gujarati')}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-semibold text-blue-700 underline hover:text-blue-900"
                              >
                                PDF
                              </a>
                            ) : (
                              <span className="text-gray-300">PDF</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
