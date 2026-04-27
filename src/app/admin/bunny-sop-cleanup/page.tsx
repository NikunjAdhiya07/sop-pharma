'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Loader2,
  RefreshCw,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  FileText,
  Calendar,
  HardDrive,
} from 'lucide-react';

interface FileEntry {
  storagePath: string;
  cdnUrl: string;
  identifier: string;
  version: number;
  language: string;
  department: string;
  filenameTimestamp: number;
}

interface DuplicateGroup {
  identifier: string;   // exact normalized, e.g. "BSGE1-5"
  language: string;
  department: string;
  files: FileEntry[];   // sorted newest-first; files[0] = keep
}

interface ApiResponse {
  success: boolean;
  totalGroups: number;
  totalDocxFiles: number;
  totalOldFiles: number;
  duplicates: DuplicateGroup[];
  error?: string;
}

function fmtTs(ts: number) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function shortPath(p: string) {
  const parts = p.split('/');
  return parts.length > 3 ? `…/${parts.slice(-3).join('/')}` : p;
}

function Banner({ ok, msg }: { ok: boolean; msg: string }) {
  return (
    <div className={`rounded-lg p-4 mb-4 flex items-start gap-2 text-sm ${ok ? 'bg-green-900/40 border border-green-700 text-green-300' : 'bg-amber-900/40 border border-amber-700 text-amber-300'}`}>
      <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
      <span>{msg}</span>
    </div>
  );
}

export default function BunnySopCleanupPage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // storagePaths selected for deletion (pre-populated with all old files)
  const [selectedDelete, setSelectedDelete] = useState<Set<string>>(new Set());
  // group keys selected for date refresh
  const [selectedRefresh, setSelectedRefresh] = useState<Set<string>>(new Set());

  const [acting, setActing] = useState<'delete' | 'fix-dates' | null>(null);
  const [banner, setBanner] = useState<{ ok: boolean; msg: string } | null>(null);

  const groupKey = (g: DuplicateGroup) => `${g.identifier}::${g.language}`;

  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setBanner(null);
    try {
      const res = await fetch('/api/admin/bunny-sop-cleanup');
      const json: ApiResponse = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed');
      setData(json);

      const delSet = new Set<string>();
      const refSet = new Set<string>();
      const expSet = new Set<string>();
      for (const g of json.duplicates) {
        for (let i = 1; i < g.files.length; i++) delSet.add(g.files[i].storagePath);
        refSet.add(groupKey(g));
        expSet.add(groupKey(g));
      }
      setSelectedDelete(delSet);
      setSelectedRefresh(refSet);
      setExpanded(expSet);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  const toggleExpand = (k: string) =>
    setExpanded((p) => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; });

  const toggleDelete = (path: string) =>
    setSelectedDelete((p) => { const n = new Set(p); n.has(path) ? n.delete(path) : n.add(path); return n; });

  const toggleRefresh = (k: string) =>
    setSelectedRefresh((p) => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; });

  const buildRefreshEntries = () => {
    const groupMap = new Map<string, DuplicateGroup>();
    for (const g of (data?.duplicates ?? [])) groupMap.set(groupKey(g), g);
    return Array.from(selectedRefresh)
      .map((k) => {
        const g = groupMap.get(k);
        if (!g?.files[0]) return null;
        return { cdnUrl: g.files[0].cdnUrl, identifier: g.files[0].identifier };
      })
      .filter((x): x is { cdnUrl: string; identifier: string } => x !== null);
  };

  const handleDelete = async () => {
    if (selectedDelete.size === 0) return;
    if (!confirm(`Permanently delete ${selectedDelete.size} old file(s) from Bunny storage?\nThis cannot be undone.`)) return;
    setActing('delete');
    setBanner(null);
    try {
      const res = await fetch('/api/admin/bunny-sop-cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', deletePaths: Array.from(selectedDelete) }),
      });
      const json = await res.json();
      const { deleted = [], errors = [] } = json.results ?? {};
      const ok = deleted.filter((d: any) => d.ok).length;
      const fail = deleted.filter((d: any) => !d.ok).length;
      setBanner({
        ok: fail === 0 && errors.length === 0,
        msg: `Deleted ${ok} file(s) from Bunny${fail ? ` · ${fail} failed` : ''}${errors.length ? ' · Errors: ' + errors.join('; ') : ''}`,
      });
      await load();
    } catch (e: any) {
      setBanner({ ok: false, msg: `Error: ${e.message}` });
    } finally {
      setActing(null);
    }
  };

  const handleFixDates = async () => {
    const entries = buildRefreshEntries();
    if (entries.length === 0) return;
    setActing('fix-dates');
    setBanner(null);
    try {
      const res = await fetch('/api/admin/bunny-sop-cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'fix-dates', refreshEntries: entries }),
      });
      const json = await res.json();
      const { dateRefresh = [], errors = [] } = json.results ?? {};
      const found = dateRefresh.filter((r: any) => r.reviewDate).length;
      const dbUpd = dateRefresh.reduce((s: number, r: any) => s + (r.sopUpdated || 0), 0);
      const noDate = dateRefresh.filter((r: any) => !r.reviewDate).map((r: any) => r.identifier);
      let msg = `Parsed ${dateRefresh.length} DOCX file(s) · Found review date in ${found} · Updated ${dbUpd} DB record(s)`;
      if (noDate.length) msg += ` · No date found in: ${noDate.join(', ')}`;
      if (errors.length) msg += ` · Errors: ${errors.join('; ')}`;
      setBanner({ ok: errors.length === 0 && noDate.length === 0, msg });
    } catch (e: any) {
      setBanner({ ok: false, msg: `Error: ${e.message}` });
    } finally {
      setActing(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
      <div className="max-w-5xl mx-auto">

        <div className="flex items-center gap-3 mb-6">
          <Link href="/admin" className="text-gray-400 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white">Bunny DOCX Cleanup</h1>
            <p className="text-sm text-gray-400 mt-0.5">
              Finds cases where the <strong>same SOP version</strong> was uploaded multiple times. Different versions (e.g. BSGE1-3 vs BSGE1-5) are not duplicates and are not shown.
            </p>
          </div>
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-gray-400 py-16 justify-center">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Scanning Bunny storage…</span>
          </div>
        )}

        {error && !loading && (
          <div className="bg-red-900/40 border border-red-700 rounded-lg p-4 text-red-300 mb-4">{error}</div>
        )}

        {banner && <Banner ok={banner.ok} msg={banner.msg} />}

        {data && !loading && (
          <>
            {/* Summary bar */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-6 flex flex-wrap gap-6 items-center">
              <Stat label="Total DOCX in Bunny" value={data.totalDocxFiles} color="text-white" />
              <Stat label="Duplicate Groups" value={data.totalGroups} color="text-amber-400" />
              <Stat label="Old Files to Remove" value={data.totalOldFiles} color="text-red-400" />
              <Stat label="Selected for Delete" value={selectedDelete.size} color="text-blue-400" />

              <div className="ml-auto flex gap-2 flex-wrap items-center">
                <button
                  onClick={load}
                  disabled={loading || !!acting}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
                >
                  <RefreshCw className="w-4 h-4" /> Refresh
                </button>

                {data.totalGroups > 0 && (
                  <>
                    {/* Fix Review Date button */}
                    <button
                      onClick={handleFixDates}
                      disabled={selectedRefresh.size === 0 || !!acting}
                      className="flex items-center gap-1.5 px-4 py-1.5 text-sm bg-blue-700 hover:bg-blue-600 text-white rounded-lg transition-colors disabled:opacity-50"
                      title="Download the newest DOCX for each selected group, extract the review date from its content, and update the database"
                    >
                      {acting === 'fix-dates' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calendar className="w-4 h-4" />}
                      Fix Review Date ({selectedRefresh.size})
                    </button>

                    {/* Delete Old Files button */}
                    <button
                      onClick={handleDelete}
                      disabled={selectedDelete.size === 0 || !!acting}
                      className="flex items-center gap-1.5 px-4 py-1.5 text-sm bg-red-700 hover:bg-red-600 text-white rounded-lg transition-colors disabled:opacity-50"
                      title="Permanently delete selected old files from Bunny storage"
                    >
                      {acting === 'delete' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      Delete Old Files ({selectedDelete.size})
                    </button>
                  </>
                )}
              </div>
            </div>

            {data.totalGroups === 0 ? (
              <div className="text-center py-16 text-gray-500">
                <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-green-600" />
                <div className="text-lg font-medium text-gray-300">No duplicate DOCX files found</div>
                <div className="text-sm mt-1">Every SOP identifier has a single file in Bunny.</div>
              </div>
            ) : (
              <div className="space-y-3">
                {data.duplicates.map((group) => {
                  const key = groupKey(group);
                  const isExpanded = expanded.has(key);
                  const newest = group.files[0];
                  const oldFiles = group.files.slice(1);
                  const oldSelCount = oldFiles.filter((f) => selectedDelete.has(f.storagePath)).length;
                  const willRefresh = selectedRefresh.has(key);

                  return (
                    <div key={key} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                      {/* Group header */}
                      <div className="flex items-center gap-2 px-4 py-3 hover:bg-gray-800/30">
                        <button
                          className="flex-1 flex items-center gap-3 text-left min-w-0"
                          onClick={() => toggleExpand(key)}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-sm font-bold text-indigo-400">{group.identifier}</span>
                              <span className="text-xs px-1.5 py-0.5 rounded bg-gray-800 text-gray-400">{group.language}</span>
                              <span className="text-xs px-1.5 py-0.5 rounded bg-gray-800 text-gray-400">{group.department}</span>
                              <span className="text-xs px-1.5 py-0.5 rounded bg-amber-900/60 text-amber-400">
                                {group.files.length} files
                              </span>
                            </div>
                            <div className="text-xs text-gray-500 mt-0.5 truncate">
                              Keep: <span className="text-gray-300">{shortPath(newest.storagePath)}</span>
                            </div>
                          </div>
                          <div className="text-xs text-gray-500 shrink-0 mr-1">
                            {oldSelCount}/{oldFiles.length} old selected
                          </div>
                          {isExpanded
                            ? <ChevronUp className="w-4 h-4 text-gray-500 shrink-0" />
                            : <ChevronDown className="w-4 h-4 text-gray-500 shrink-0" />}
                        </button>

                        {/* Per-group "Fix date" toggle */}
                        <label
                          className="flex items-center gap-1 text-xs text-gray-400 cursor-pointer shrink-0 ml-1 select-none"
                          title="Include this group's newest DOCX in date refresh"
                        >
                          <input
                            type="checkbox"
                            checked={willRefresh}
                            onChange={() => toggleRefresh(key)}
                            className="accent-blue-500 w-3.5 h-3.5"
                          />
                          <Calendar className="w-3.5 h-3.5 text-blue-400" />
                          <span className="hidden sm:inline">Fix Date</span>
                        </label>
                      </div>

                      {isExpanded && (
                        <div className="border-t border-gray-800 overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-gray-500 border-b border-gray-800">
                                <th className="px-4 py-2 text-left">Del?</th>
                                <th className="px-4 py-2 text-left">Status</th>
                                <th className="px-4 py-2 text-left">Identifier</th>
                                <th className="px-4 py-2 text-left">Ver</th>
                                <th className="px-4 py-2 text-left">Uploaded</th>
                                <th className="px-4 py-2 text-left">Path</th>
                              </tr>
                            </thead>
                            <tbody>
                              {group.files.map((file, idx) => {
                                const isNewest = idx === 0;
                                const isSelected = selectedDelete.has(file.storagePath);
                                return (
                                  <tr
                                    key={file.storagePath}
                                    className={`border-b border-gray-800/40 last:border-0 ${isNewest ? 'bg-green-950/20' : isSelected ? 'bg-red-950/20' : ''}`}
                                  >
                                    <td className="px-4 py-2.5">
                                      {isNewest ? (
                                        <HardDrive className="w-3.5 h-3.5 text-green-600" />
                                      ) : (
                                        <input
                                          type="checkbox"
                                          checked={isSelected}
                                          onChange={() => toggleDelete(file.storagePath)}
                                          className="accent-red-500 w-3.5 h-3.5 cursor-pointer"
                                        />
                                      )}
                                    </td>
                                    <td className="px-4 py-2.5">
                                      {isNewest ? (
                                        <span className="text-green-400 flex items-center gap-1">
                                          <CheckCircle2 className="w-3 h-3" /> Keep
                                        </span>
                                      ) : (
                                        <span className="text-red-400 flex items-center gap-1">
                                          <AlertTriangle className="w-3 h-3" /> Old
                                        </span>
                                      )}
                                    </td>
                                    <td className="px-4 py-2.5 font-mono text-gray-300">{file.identifier}</td>
                                    <td className="px-4 py-2.5 text-gray-400">{file.version}</td>
                                    <td className="px-4 py-2.5 text-gray-400 whitespace-nowrap">
                                      {fmtTs(file.filenameTimestamp)}
                                    </td>
                                    <td
                                      className="px-4 py-2.5 text-gray-500 max-w-[260px] truncate"
                                      title={file.storagePath}
                                    >
                                      <FileText className="w-3 h-3 inline mr-1 shrink-0" />
                                      {shortPath(file.storagePath)}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-gray-400 mt-0.5">{label}</div>
    </div>
  );
}
